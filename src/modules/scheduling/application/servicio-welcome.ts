import { registrarAuditoria } from "@/modules/audit";
import { enviarVideoWelcome } from "@/modules/notifications";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { JOIN_NOMBRE_GUIA, NOMBRE_GUIA } from "../infrastructure/scheduling-repository";
import { validarRango } from "./servicio";
import { MAX_INTENTOS_WELCOME, RESERVA_VIGENTE } from "./welcome";

/**
 * SERVICIO › WELCOME como en MOSAICO (Servicio › Welcome Session), ajustado a
 * KIDS (2026-10-14). Cuatro bandejas:
 *  - Eventos Welcome: los agendados y su asistencia.
 *  - Reagendamientos: a quién faltó, agrupado por el Welcome perdido, y si ya
 *    tiene otro (DERIVADO: hay una reserva ACTIVA en un Welcome futuro).
 *  - Pendientes de agendar: niños matriculados sin ningún Welcome, con el motivo.
 *  - Video Welcome: quien faltó a sus 2 Welcome sin asistir a ninguno recibe el
 *    enlace del video por WhatsApp (al apoderado). Enviarlo cuenta como Welcome
 *    hecho: sale de las bandejas de inasistentes.
 *
 * Lo que NO aplica de MOSAICO: "promover desde WELCOME". Allá el alumno vive en
 * un curso puente hasta asistir; aquí el niño ya está matriculado en su salón.
 *
 * Todo se DERIVA de las reservas (ACTIVA y REAGENDADA: la de un Welcome perdido
 * no se borra) y del registro de envíos del video; nada se guarda dos veces.
 */

const MAX_FILAS = 2000;
/** Envíos de video por tanda, como MOSAICO. */
export const MAX_VIDEOS_POR_TANDA = 60;
const CLAVE_VIDEO = "welcome_video_url";

// —— Piezas comunes ——————————————————————————————————————————————————————

/** Termina = ya no se puede asistir (inicio + duración). */
const TERMINO = (w: string) =>
  `(${w}.starts_at + make_interval(mins => ${w}.duracion_min) <= now())`;

/** Por niño: si asistió a ALGÚN Welcome, intentos perdidos y si vio el video. */
const HISTORIA_NINO = `LEFT JOIN LATERAL (
    SELECT COALESCE(bool_or(r2.asistio), false) AS asistio_alguna,
           count(*)::int AS sesiones,
           count(*) FILTER (WHERE ${TERMINO("w2")} AND r2.asistio IS NOT TRUE)::int AS perdidos,
           max(w2.starts_at) FILTER (WHERE NOT ${TERMINO("w2")} AND r2.estado = 'ACTIVA') AS proximo
      FROM scheduling_welcome_reserva r2 JOIN scheduling_welcome w2 ON w2.id = r2.welcome_id
     WHERE r2.child_person_id = b.id AND r2.estado IN ${RESERVA_VIGENTE}) h ON true
  LEFT JOIN LATERAL (
    SELECT max(v.created_at) AS ultimo, count(*)::int AS envios
      FROM scheduling_welcome_video_envio v
     WHERE v.child_person_id = b.id AND v.ok) vid ON true`;

/** El niño, su matrícula viva y su apoderado (para llamar o escribir). */
const CONTEXTO_NINO = `
  LEFT JOIN identity_user u ON u.id = b.user_id
  LEFT JOIN LATERAL (
    SELECT ca.id AS campaign_id, ca.nombre AS campania, co.tipo::text AS curso,
           cl.id AS classroom_id, cl.nombre AS salon, e.created_at AS matriculado_en,
           e.estado AS matricula_estado
      FROM enrollment_enrollment e
      JOIN scheduling_classroom cl ON cl.id = e.classroom_id
      JOIN catalog_course co ON co.id = cl.course_id
      JOIN catalog_campaign ca ON ca.id = co.campaign_id
     WHERE e.child_person_id = b.id AND e.estado IN ('ACTIVA', 'RESERVADA')
     ORDER BY e.created_at DESC LIMIT 1) m ON true
  LEFT JOIN LATERAL (
    SELECT p.nombres || ' ' || p.apellidos AS nombre, p.telefono
      FROM people_guardianship g JOIN people_person p ON p.id = g.apoderado_id
     WHERE g.nino_id = b.id
     ORDER BY (p.telefono IS NULL OR p.telefono = ''), p.nombres
     LIMIT 1) ap ON true
  LEFT JOIN LATERAL (
    SELECT k.external_ref, k.numero FROM contracts_contract k
     WHERE k.beneficiario_id = b.id
     ORDER BY (k.estado IN ('APROBADO', 'ONHOLD')) DESC, k.created_at DESC LIMIT 1) k ON true`;

const COLUMNAS_NINO = `
  b.id AS "childPersonId", b.nombres || ' ' || b.apellidos AS nombre,
  b.doc_numero AS documento, u.username, b.country_code AS pais,
  m.campania, m.curso, m.salon, ap.nombre AS apoderado, ap.telefono AS "telefonoApoderado",
  COALESCE(ap.telefono, b.telefono) AS telefono,
  k.external_ref AS "externalRef", k.numero AS "contratoNumero"`;

export interface NinoWelcome {
  childPersonId: string;
  nombre: string;
  documento: string;
  username: string | null;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  apoderado: string | null;
  telefonoApoderado: string | null;
  telefono: string | null;
  externalRef: string | null;
  contratoNumero: number | null;
}

export interface FiltrosNino {
  countryScope: string[] | null;
  buscar?: string | null;
  campaignId?: string | null;
  curso?: string | null;
  classroomId?: string | null;
}

/** Filtros del niño: alcance, matrícula (campaña/curso/salón) y búsqueda por palabras. */
function condicionesNino(f: FiltrosNino, values: unknown[]): string[] {
  const cond: string[] = [];
  const agregar = (sql: (n: string) => string, valor: unknown) => {
    values.push(valor);
    cond.push(sql(`$${String(values.length)}`));
  };
  if (f.countryScope !== null) agregar((n) => `b.country_code = ANY(${n}::text[])`, f.countryScope);
  if (f.campaignId != null && f.campaignId !== "")
    agregar((n) => `m.campaign_id = ${n}`, f.campaignId);
  if (f.curso != null && f.curso !== "") agregar((n) => `m.curso = ${n}`, f.curso);
  if (f.classroomId != null && f.classroomId !== "")
    agregar((n) => `m.classroom_id = ${n}`, f.classroomId);
  const palabras = (f.buscar ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p !== "")
    .slice(0, 5);
  const sinTildes = (col: string) =>
    `translate(lower(${col}), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun')`;
  for (const p of palabras) {
    values.push(`%${p}%`);
    const t = `$${String(values.length)}`;
    const doc = p.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let porDoc = "";
    if (doc !== "") {
      values.push(`%${doc}%`);
      const d = `$${String(values.length)}`;
      porDoc = `OR upper(regexp_replace(b.doc_numero, '[^0-9A-Za-z]', '', 'g')) LIKE ${d}
                OR upper(regexp_replace(COALESCE(k.external_ref, ''), '[^0-9A-Za-z]', '', 'g')) LIKE ${d}`;
    }
    cond.push(`(${sinTildes("b.nombres")} LIKE ${t} OR ${sinTildes("b.apellidos")} LIKE ${t}
       OR lower(u.username) LIKE ${t} ${porDoc})`);
  }
  return cond;
}

function exigirZona(zona: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zona });
  } catch {
    throw new ValidationError("Zona horaria inválida.");
  }
}

/** Rango de fechas OPCIONAL sobre el inicio de un Welcome, en el reloj de quien mira. */
function condicionFechas(
  f: { desde?: string | null; hasta?: string | null; zona: string },
  values: unknown[],
  col: string,
): string[] {
  const desde = f.desde ?? "";
  const hasta = f.hasta ?? "";
  if (desde === "" && hasta === "") return [];
  if (desde !== "" && hasta !== "") validarRango(desde, hasta);
  for (const d of [desde, hasta]) {
    if (d !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new ValidationError("Las fechas deben ser YYYY-MM-DD.");
    }
  }
  exigirZona(f.zona);
  values.push(f.zona);
  const z = `$${String(values.length)}`;
  const cond: string[] = [];
  if (desde !== "") {
    values.push(desde);
    cond.push(`(${col} AT TIME ZONE ${z})::date >= $${String(values.length)}::date`);
  }
  if (hasta !== "") {
    values.push(hasta);
    cond.push(`(${col} AT TIME ZONE ${z})::date <= $${String(values.length)}::date`);
  }
  return cond;
}

const y = (cond: string[]) => cond.map((c) => `AND ${c}`).join("\n        ");

// —— 1. Eventos Welcome ——————————————————————————————————————————————————

/**
 * El estado de una reserva, como MOSAICO (más el video, que aquí cierra el
 * ciclo): ASISTIO a esta · ASISTIO_OTRA (faltó a esta pero fue a otra) ·
 * VIDEO (faltó y se le mandó el video) · PENDIENTE (el Welcome todavía no
 * termina: decide la fecha, no la marca) · NO_ASISTIO (pasó y no fue a ninguno).
 */
export type EstadoWelcome = "ASISTIO" | "ASISTIO_OTRA" | "VIDEO" | "PENDIENTE" | "NO_ASISTIO";

export interface AgendadoWelcome extends NinoWelcome {
  reservaId: string;
  welcomeId: string;
  startsAt: string;
  duracionMin: number;
  guia: string;
  nivel: string;
  asistio: boolean | null;
  estado: EstadoWelcome;
  /** Welcome agendados del niño EN TOTAL (no depende del filtro de fechas). */
  sesiones: number;
  /** Quién lo agendó: NULL = el propio niño desde su enlace de perfil. */
  agendadoPor: string | null;
}

const SQL_ESTADO_WELCOME = `CASE
    WHEN r.asistio IS TRUE THEN 'ASISTIO'
    WHEN h.asistio_alguna THEN 'ASISTIO_OTRA'
    WHEN vid.ultimo IS NOT NULL THEN 'VIDEO'
    WHEN NOT ${TERMINO("w")} THEN 'PENDIENTE'
    ELSE 'NO_ASISTIO' END`;

export async function agendadosWelcome(
  f: FiltrosNino & {
    desde?: string | null;
    hasta?: string | null;
    zona: string;
    estado?: EstadoWelcome | null;
  },
): Promise<AgendadoWelcome[]> {
  exigirZona(f.zona);
  const values: unknown[] = [];
  const cond = [...condicionesNino(f, values), ...condicionFechas(f, values, "w.starts_at")];
  if (f.estado != null) {
    values.push(f.estado);
    cond.push(`${SQL_ESTADO_WELCOME} = $${String(values.length)}`);
  }
  return queryRows<AgendadoWelcome>(
    `SELECT r.id AS "reservaId", w.id AS "welcomeId", w.starts_at AS "startsAt",
            w.duracion_min AS "duracionMin", ${NOMBRE_GUIA} AS guia, w.nivel, r.asistio,
            ${SQL_ESTADO_WELCOME} AS estado, h.sesiones,
            CASE WHEN r.agendado_por IS NULL THEN NULL
                 ELSE (SELECT username FROM identity_user WHERE id = r.agendado_por) END
              AS "agendadoPor",
            ${COLUMNAS_NINO}
       FROM scheduling_welcome_reserva r
       JOIN scheduling_welcome w ON w.id = r.welcome_id
       JOIN people_person b ON b.id = r.child_person_id
       JOIN identity_user gu ON gu.id = w.guia_user_id
       ${JOIN_NOMBRE_GUIA}
       ${CONTEXTO_NINO}
       ${HISTORIA_NINO}
      WHERE r.estado IN ${RESERVA_VIGENTE}
        ${y(cond)}
      ORDER BY w.starts_at DESC, b.apellidos, b.nombres
      LIMIT ${String(MAX_FILAS)}`,
    values,
  );
}

// —— 2. Reagendamientos ——————————————————————————————————————————————————

export interface InasistenteWelcome extends NinoWelcome {
  reservaId: string;
  welcomeId: string;
  /** El Welcome al que faltó. */
  startsAt: string;
  guia: string;
  nivel: string;
  /** Inicio del Welcome que ya tiene agendado (derivado), o null. */
  reagendadoA: string | null;
  /** Welcome perdidos del niño: con MAX_INTENTOS, toca el video. */
  perdidos: number;
}

/**
 * Los que FALTARON a un Welcome: ya terminó, no asistieron, no fueron a ningún
 * otro y no recibieron el video. Si ya tienen otro agendado, `reagendadoA` lo
 * dice (derivado, como MOSAICO: la reserva perdida no se toca).
 */
export async function reagendamientosWelcome(
  f: FiltrosNino & {
    desde?: string | null;
    hasta?: string | null;
    zona: string;
    soloSinReagendar?: boolean;
  },
): Promise<InasistenteWelcome[]> {
  exigirZona(f.zona);
  const values: unknown[] = [];
  const cond = [...condicionesNino(f, values), ...condicionFechas(f, values, "w.starts_at")];
  if (f.soloSinReagendar === true) cond.push("h.proximo IS NULL");
  return queryRows<InasistenteWelcome>(
    `SELECT r.id AS "reservaId", w.id AS "welcomeId", w.starts_at AS "startsAt",
            ${NOMBRE_GUIA} AS guia, w.nivel, h.proximo AS "reagendadoA", h.perdidos,
            ${COLUMNAS_NINO}
       FROM scheduling_welcome_reserva r
       JOIN scheduling_welcome w ON w.id = r.welcome_id
       JOIN people_person b ON b.id = r.child_person_id
       JOIN identity_user gu ON gu.id = w.guia_user_id
       ${JOIN_NOMBRE_GUIA}
       ${CONTEXTO_NINO}
       ${HISTORIA_NINO}
      WHERE r.estado IN ${RESERVA_VIGENTE}
        AND ${TERMINO("w")} AND r.asistio IS NOT TRUE
        AND NOT h.asistio_alguna AND vid.ultimo IS NULL
        ${y(cond)}
      ORDER BY w.starts_at DESC, b.apellidos, b.nombres
      LIMIT ${String(MAX_FILAS)}`,
    values,
  );
}

// —— 3. Pendientes de agendar ————————————————————————————————————————————

/**
 * Por qué un niño no tiene Welcome (como MOSAICO, derivado):
 *  - SOLO_PERFIL: se le mandó el enlace de perfil SIN Welcome (curso ya andando).
 *  - SIN_PERFIL: todavía no crea su perfil (ahí es donde lo agenda).
 *  - SIN_DISPONIBILIDAD: creó su perfil sin Welcome porque no había ninguno con
 *    cupo ("consultaré a Servicio"): hay que agendárselo.
 *  - SIN_REGISTRO: creó su perfil y no quedó agendado.
 */
export type MotivoPendiente = "SOLO_PERFIL" | "SIN_PERFIL" | "SIN_DISPONIBILIDAD" | "SIN_REGISTRO";

export interface PendienteWelcome extends NinoWelcome {
  motivo: MotivoPendiente;
  /** Desde cuándo está matriculado (la cola va de lo más antiguo a lo nuevo). */
  pendienteDesde: string | null;
}

const SQL_MOTIVO = `CASE
    WHEN ep.exige_welcome = false THEN 'SOLO_PERFIL'
    WHEN b.perfil_completado_en IS NULL THEN 'SIN_PERFIL'
    WHEN ep.sin_welcome_disponible THEN 'SIN_DISPONIBILIDAD'
    ELSE 'SIN_REGISTRO' END`;

/**
 * Niños con matrícula ACTIVA (contrato aprobado) que no tienen ningún Welcome
 * agendado ni perdido, no asistieron a ninguno y no recibieron el video.
 */
export async function pendientesWelcome(
  f: FiltrosNino & { motivo?: MotivoPendiente | null },
): Promise<PendienteWelcome[]> {
  const values: unknown[] = [];
  const cond = condicionesNino(f, values);
  if (f.motivo != null) {
    values.push(f.motivo);
    cond.push(`${SQL_MOTIVO} = $${String(values.length)}`);
  }
  return queryRows<PendienteWelcome>(
    `SELECT ${COLUMNAS_NINO}, ${SQL_MOTIVO} AS motivo, m.matriculado_en AS "pendienteDesde"
       FROM people_person b
       ${CONTEXTO_NINO}
       ${HISTORIA_NINO}
       LEFT JOIN LATERAL (
            SELECT exige_welcome, sin_welcome_disponible FROM contracts_enlace_perfil
             WHERE child_person_id = b.id ORDER BY creado_en DESC LIMIT 1) ep ON true
      WHERE m.matricula_estado = 'ACTIVA'
        AND COALESCE(h.sesiones, 0) = 0
        AND vid.ultimo IS NULL
        ${y(cond)}
      ORDER BY m.matriculado_en ASC, b.apellidos
      LIMIT ${String(MAX_FILAS)}`,
    values,
  );
}

// —— 4. Video Welcome ————————————————————————————————————————————————————

export interface CandidatoVideo extends NinoWelcome {
  perdidos: number;
  ultimoPerdido: string | null;
  /** Último envío que salió bien (null = pendiente), y cuántos van. */
  ultimoEnvio: string | null;
  envios: number;
}

/**
 * Quién recibe el video: faltó a sus `MAX_INTENTOS_WELCOME` Welcome, no asistió
 * a ninguno y no tiene otro por delante. Los que ya lo recibieron siguen en la
 * lista (pestaña "Enviados"), para poder reenviarlo.
 */
export async function candidatosVideoWelcome(f: FiltrosNino): Promise<CandidatoVideo[]> {
  const values: unknown[] = [MAX_INTENTOS_WELCOME];
  const cond = condicionesNino(f, values);
  return queryRows<CandidatoVideo>(
    `SELECT ${COLUMNAS_NINO}, h.perdidos,
            (SELECT max(w3.starts_at) FROM scheduling_welcome_reserva r3
               JOIN scheduling_welcome w3 ON w3.id = r3.welcome_id
              WHERE r3.child_person_id = b.id AND r3.estado IN ${RESERVA_VIGENTE}
                AND r3.asistio IS NOT TRUE) AS "ultimoPerdido",
            vid.ultimo AS "ultimoEnvio", COALESCE(vid.envios, 0) AS envios
       FROM people_person b
       ${CONTEXTO_NINO}
       ${HISTORIA_NINO}
      WHERE h.perdidos >= $1 AND NOT h.asistio_alguna AND h.proximo IS NULL
        ${y(cond)}
      ORDER BY vid.ultimo NULLS FIRST, b.apellidos
      LIMIT ${String(MAX_FILAS)}`,
    values,
  );
}

/** El enlace del video de bienvenida (YouTube no listado, Drive…), o null. */
export async function videoWelcome(): Promise<{
  enlace: string | null;
  actualizadoEn: string | null;
}> {
  const fila = await queryOne<{ valor: string; actualizadoEn: string }>(
    `SELECT valor, actualizado_en AS "actualizadoEn" FROM platform_config WHERE clave = $1`,
    [CLAVE_VIDEO],
  );
  return { enlace: fila?.valor ?? null, actualizadoEn: fila?.actualizadoEn ?? null };
}

/**
 * Cambia el enlace del video. MOSAICO sube el archivo (hasta 300 MB) a su
 * almacenamiento; aquí va un ENLACE: un video así por una ruta de Node no
 * conviene, y el enlace no cambia aunque se reemplace el video detrás.
 */
export async function guardarVideoWelcome(input: {
  actorUserId: string;
  enlace: string;
  ip?: string | null;
}): Promise<void> {
  let url: URL;
  try {
    url = new URL(input.enlace.trim());
  } catch {
    throw new ValidationError("Escribe un enlace completo (https://…).");
  }
  if (url.protocol !== "https:") throw new ValidationError("El enlace tiene que ser https.");
  await execute(
    `INSERT INTO platform_config (clave, valor, actualizado_por, actualizado_en)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (clave) DO UPDATE
       SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por,
           actualizado_en = CURRENT_TIMESTAMP`,
    [CLAVE_VIDEO, url.toString(), input.actorUserId],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.welcome_video_cambiado",
    entidad: "platform_config",
    entidadId: CLAVE_VIDEO,
    payload: { enlace: url.toString() },
    ip: input.ip ?? null,
  });
}

export interface ResultadoVideo {
  childPersonId: string;
  nombre: string;
  ok: boolean;
  destinatario: string | null;
  error?: string;
}

/**
 * Manda el video a los apoderados elegidos (máx. 60). Vuelve a calcular en el
 * servidor quién es candidato: lo que mande la pantalla no basta. Cada envío
 * queda registrado —salga bien o no— y uno que falla no frena a los demás.
 */
export async function enviarVideosWelcome(input: {
  actorUserId: string;
  childPersonIds: string[];
  countryScope: string[] | null;
  ip?: string | null;
}): Promise<ResultadoVideo[]> {
  const ids = [...new Set(input.childPersonIds)];
  if (ids.length === 0) throw new ValidationError("Elige al menos un niño.");
  if (ids.length > MAX_VIDEOS_POR_TANDA) {
    throw new ValidationError(`Máximo ${String(MAX_VIDEOS_POR_TANDA)} envíos por tanda.`);
  }
  const { enlace } = await videoWelcome();
  if (enlace === null) {
    throw new ValidationError("Primero configura el enlace del video de bienvenida.");
  }
  const candidatos = new Map(
    (await candidatosVideoWelcome({ countryScope: input.countryScope })).map((c) => [
      c.childPersonId,
      c,
    ]),
  );
  const resultados: ResultadoVideo[] = [];
  for (const id of ids) {
    const c = candidatos.get(id);
    if (c === undefined) {
      resultados.push({
        childPersonId: id,
        nombre: id,
        ok: false,
        destinatario: null,
        error:
          "Ya no le corresponde el video (asistió, tiene otro Welcome o no está en tu alcance).",
      });
      continue;
    }
    // Uno que falla (sin apoderado, proveedor caído) no frena a los demás.
    let r: { ok: boolean; destinatario: string | null; error?: string };
    try {
      r = await enviarVideoWelcome({ actorUserId: input.actorUserId, childPersonId: id, enlace });
    } catch (e) {
      r = { ok: false, destinatario: null, error: e instanceof Error ? e.message : String(e) };
    }
    await execute(
      `INSERT INTO scheduling_welcome_video_envio
         (id, child_person_id, telefono, enlace, ok, error, enviado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [newId(), id, r.destinatario ?? "", enlace, r.ok, r.error ?? null, input.actorUserId],
    );
    resultados.push({
      childPersonId: id,
      nombre: c.nombre,
      ok: r.ok,
      destinatario: r.destinatario,
      ...(r.error !== undefined && { error: r.error }),
    });
  }
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.welcome_video_enviado",
    entidad: "scheduling_welcome_video_envio",
    entidadId: null,
    payload: {
      enviados: resultados.filter((x) => x.ok).length,
      fallidos: resultados.filter((x) => !x.ok).length,
    },
    ip: input.ip ?? null,
  });
  return resultados;
}
