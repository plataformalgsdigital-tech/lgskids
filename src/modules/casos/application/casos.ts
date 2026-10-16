import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import {
  AREAS,
  ESTADO_AL_ASIGNAR,
  ESTADOS_QUE_CIERRAN,
  cierraElCaso,
  prefijoCodigo,
  problemaCierre,
  problemaTransicion,
  reincidencia,
  type Area,
  type Canal,
  type Estado,
  type Origen,
  type Reincidencia,
  type Resultado,
  type Tema,
} from "../domain/casos";

/**
 * CASOS DE ATENCIÓN (2026-10-14) — la aplicación. Ver las reglas y las
 * diferencias con MOSAICO en `domain/casos.ts`.
 *
 * El contexto del caso (salón, campaña, guía, apoderado, teléfono) se DERIVA al
 * leer, nunca se copia al caso (regla R10 de MOSAICO): si el niño cambia de
 * salón, el caso lo dice.
 */

const LARGO_TEXTO = 2000;
const SQL_CIERRAN = `(${ESTADOS_QUE_CIERRAN.map((e) => `'${e}'`).join(", ")})`;

/** Nombre de una cuenta: ficha de guía, de staff, de persona o el usuario. */
const nombreDe = (col: string) => `(SELECT COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', g.nombres, g.apellidos)), ''),
      NULLIF(TRIM(CONCAT_WS(' ', pf.nombres, pf.apellidos)), ''),
      NULLIF(TRIM(CONCAT_WS(' ', pp.nombres, pp.apellidos)), ''),
      u.username)
   FROM identity_user u
   LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
   LEFT JOIN identity_perfil pf ON pf.user_id = u.id
   LEFT JOIN people_person pp ON pp.user_id = u.id
  WHERE u.id = ${col})`;

function exigirTexto(texto: string, que: string, minimo = 5): string {
  const t = texto.trim();
  if (t.length < minimo)
    throw new ValidationError(`Escribe ${que} (mínimo ${String(minimo)} caracteres).`);
  if (t.length > LARGO_TEXTO) {
    throw new ValidationError(`${que} admite hasta ${String(LARGO_TEXTO)} caracteres.`);
  }
  return t;
}

/** El niño existe y está en el alcance por país de quien actúa. */
async function exigirNino(childPersonId: string, countryScope: string[] | null): Promise<void> {
  const p = await queryOne<{ pais: string }>(
    `SELECT country_code AS pais FROM people_person WHERE id = $1`,
    [childPersonId],
  );
  if (p === null || (countryScope !== null && !countryScope.includes(p.pais))) {
    throw new NotFoundError("El niño no existe.");
  }
}

interface FilaCasoBase {
  id: string;
  codigo: string;
  childPersonId: string;
  estado: Estado;
  area: Area | null;
  tema: Tema;
  acuerdo: string | null;
}

async function casoParaCambiar(
  tx: PoolClient,
  casoId: string,
  countryScope: string[] | null,
): Promise<FilaCasoBase> {
  const c = await queryOne<FilaCasoBase & { pais: string }>(
    `SELECT c.id, c.codigo, c.child_person_id AS "childPersonId", c.estado, c.area, c.tema,
            c.acuerdo, p.country_code AS pais
       FROM casos_caso c JOIN people_person p ON p.id = c.child_person_id
      WHERE c.id = $1 FOR UPDATE OF c`,
    [casoId],
    tx,
  );
  if (c === null || (countryScope !== null && !countryScope.includes(c.pais))) {
    throw new NotFoundError("El caso no existe.");
  }
  return c;
}

// —— Abrir: el reporte ————————————————————————————————————————————————————

export interface CasoAbierto {
  id: string;
  codigo: string;
  tema: Tema;
  estado: Estado;
  area: Area | null;
  abiertoEn: string;
  reportes: number;
  ultimaAccion: string | null;
}

/** Los casos ABIERTOS del niño: a cuál se suma un reporte nuevo. */
export async function casosAbiertosDeNino(childPersonId: string): Promise<CasoAbierto[]> {
  return queryRows<CasoAbierto>(
    `SELECT c.id, c.codigo, c.tema, c.estado, c.area, c.abierto_en AS "abiertoEn",
            (SELECT count(*) FROM casos_reporte r WHERE r.caso_id = c.id)::int AS reportes,
            (SELECT s.texto FROM casos_seguimiento s WHERE s.caso_id = c.id
              ORDER BY s.created_at DESC LIMIT 1) AS "ultimaAccion"
       FROM casos_caso c
      WHERE c.child_person_id = $1 AND c.estado NOT IN ${SQL_CIERRAN}
      ORDER BY c.abierto_en DESC`,
    [childPersonId],
  );
}

/** Abre un caso en `tx` y devuelve su id y código. */
async function abrirCasoTx(
  tx: PoolClient,
  input: {
    childPersonId: string;
    tema: Tema;
    origen: Origen;
    sessionId: string | null;
    actorUserId: string;
  },
): Promise<{ id: string; codigo: string }> {
  // El contrato del niño (el vivo primero) da el prefijo del código.
  const contrato = await queryOne<{ id: string; externalRef: string | null; numero: number }>(
    `SELECT id, external_ref AS "externalRef", numero FROM contracts_contract
      WHERE beneficiario_id = $1
      ORDER BY (estado IN ('APROBADO', 'ONHOLD')) DESC, created_at DESC LIMIT 1`,
    [input.childPersonId],
    tx,
  );
  const prefijo = prefijoCodigo(contrato);
  // Contador por contrato sin carreras: dos reportes simultáneos del mismo
  // contrato (hermanos) esperan uno al otro.
  await execute(`SELECT pg_advisory_xact_lock(8471, hashtext($1))`, [prefijo], tx);
  const ultimo = await queryOne<{ n: number | null }>(
    `SELECT max(substring(codigo FROM '[0-9]+$')::int) AS n FROM casos_caso
      WHERE codigo LIKE $1 || '-%'`,
    [prefijo],
    tx,
  );
  const codigo = `${prefijo}-${String((ultimo?.n ?? 0) + 1).padStart(2, "0")}`;
  const numero = await queryOne<{ n: number }>(
    `SELECT count(*)::int + 1 AS n FROM casos_caso WHERE child_person_id = $1`,
    [input.childPersonId],
    tx,
  );
  const id = newId();
  await execute(
    `INSERT INTO casos_caso
       (id, codigo, child_person_id, contract_id, numero_caso, tema, origen, session_origen_id,
        abierto_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      codigo,
      input.childPersonId,
      contrato?.id ?? null,
      numero?.n ?? 1,
      input.tema,
      input.origen,
      input.sessionId,
      input.actorUserId,
    ],
    tx,
  );
  await execute(
    `INSERT INTO casos_seguimiento (id, caso_id, tipo, estado_nuevo, texto, autor)
     VALUES ($1, $2, 'ESTADO', 'EN_GESTION', $3, $4)`,
    [
      newId(),
      id,
      input.origen === "GUIA"
        ? "Caso abierto por un reporte del guía"
        : "Caso abierto por el equipo de Servicio",
      input.actorUserId,
    ],
    tx,
  );
  return { id, codigo };
}

export interface ReporteCreado {
  casoId: string;
  codigo: string;
  abrioCaso: boolean;
}

/**
 * Registra un REPORTE sobre un niño y lo pone en un caso:
 *  - si el niño no tiene casos abiertos, abre uno;
 *  - si los tiene, quien reporta ELIGE (`destino`): sumarlo a uno de ellos, o
 *    "NUEVO". Sin elegir, 409 con los casos abiertos en `details` para que la
 *    pantalla pregunte (regla R2 de MOSAICO).
 *  - un caso NUEVO con el MISMO tema que uno abierto se rechaza: un caso abierto
 *    por tema (R3).
 * El reporte es INMUTABLE.
 *
 * Quién puede y a nombre de quién lo resuelve la ruta: el guía desde su sesión
 * (`origen` GUIA, a su nombre) o Servicio desde la bandeja (`origen` SERVICIO,
 * opcionalmente a nombre de un guía).
 */
export async function reportarCaso(input: {
  actorUserId: string;
  childPersonId: string;
  texto: string;
  tema: Tema;
  origen: Origen;
  sessionId?: string | null;
  guiaUserId?: string | null;
  destino?: string | null;
  countryScope: string[] | null;
  ip?: string | null;
}): Promise<ReporteCreado> {
  const texto = exigirTexto(input.texto, "qué pasó");
  await exigirNino(input.childPersonId, input.countryScope);

  const r = await withTransaction(async (tx) => {
    // Bloquea los casos abiertos del niño: dos reportes a la vez no abren dos casos.
    const abiertos = await queryRows<{ id: string; codigo: string; tema: Tema }>(
      `SELECT id, codigo, tema FROM casos_caso
        WHERE child_person_id = $1 AND estado NOT IN ${SQL_CIERRAN}
        ORDER BY abierto_en DESC FOR UPDATE`,
      [input.childPersonId],
      tx,
    );
    let casoId: string;
    let codigo: string;
    let abrio = false;
    if (abiertos.length > 0 && (input.destino == null || input.destino === "")) {
      throw new ConflictError(
        "El niño ya tiene un caso abierto: elige si sumarlo o abrir uno nuevo.",
        {
          details: { tipo: "caso_abierto", casos: await casosAbiertosDeNino(input.childPersonId) },
        },
      );
    }
    if (input.destino != null && input.destino !== "" && input.destino !== "NUEVO") {
      const destino = abiertos.find((c) => c.id === input.destino);
      if (destino === undefined) {
        throw new ConflictError("Ese caso ya no está abierto: vuelve a elegir.");
      }
      casoId = destino.id;
      codigo = destino.codigo;
    } else {
      const mismoTema = abiertos.find((c) => c.tema === input.tema);
      if (mismoTema !== undefined) {
        throw new ConflictError(
          `Ya hay un caso abierto de ese tipo (${mismoTema.codigo}): súmalo a ese.`,
        );
      }
      const nuevo = await abrirCasoTx(tx, {
        childPersonId: input.childPersonId,
        tema: input.tema,
        origen: input.origen,
        sessionId: input.sessionId ?? null,
        actorUserId: input.actorUserId,
      });
      casoId = nuevo.id;
      codigo = nuevo.codigo;
      abrio = true;
    }
    await execute(
      `INSERT INTO casos_reporte
         (id, caso_id, child_person_id, texto, tema, session_id, guia_user_id, registrado_por,
          abrio_caso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newId(),
        casoId,
        input.childPersonId,
        texto,
        input.tema,
        input.sessionId ?? null,
        input.guiaUserId ?? null,
        input.actorUserId,
        abrio,
      ],
      tx,
    );
    await execute(`UPDATE casos_caso SET updated_at = now() WHERE id = $1`, [casoId], tx);
    return { casoId, codigo, abrioCaso: abrio };
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: r.abrioCaso ? "casos.caso_abierto" : "casos.reporte_sumado",
    entidad: "casos_caso",
    entidadId: r.casoId,
    payload: {
      codigo: r.codigo,
      tema: input.tema,
      origen: input.origen,
      sessionId: input.sessionId ?? null,
    },
    ip: input.ip ?? null,
  });
  return r;
}

/**
 * El guía solo reporta sobre un niño de la lista de ESA sesión (matrícula viva en
 * su salón), y solo si la sesión es suya o tiene `salones.gestionar`.
 */
export async function exigirReporteDesdeSesion(input: {
  actorUserId: string;
  sessionId: string;
  childPersonId: string;
  puedeGestionarSalones: boolean;
}): Promise<{ guiaUserId: string | null }> {
  const s = await queryOne<{ guia: string | null; classroomId: string; startsAt: string }>(
    `SELECT COALESCE(s.guia_user_id, cl.guia_user_id) AS guia, s.classroom_id AS "classroomId",
            s.starts_at AS "startsAt"
       FROM scheduling_session s JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE s.id = $1`,
    [input.sessionId],
  );
  if (s === null) throw new NotFoundError("La sesión no existe.");
  if (!input.puedeGestionarSalones && s.guia !== input.actorUserId) {
    throw new ForbiddenError("Solo puedes reportar casos de tus propias sesiones.");
  }
  const enLista = await queryOne<{ ok: boolean }>(
    // Su salón, o agendado en ESTA sesión desde otro (Academic management › Agendar).
    `SELECT true AS ok FROM enrollment_enrollment
      WHERE classroom_id = $1 AND child_person_id = $2 AND estado IN ('ACTIVA', 'RESERVADA')
     UNION ALL
     SELECT true FROM scheduling_agendado
      WHERE classroom_id = $1 AND child_person_id = $2 AND starts_at = $3 AND estado = 'ACTIVA'
      LIMIT 1`,
    [s.classroomId, input.childPersonId, s.startsAt],
  );
  if (enLista === null) {
    throw new ValidationError("El niño no está en la lista de ese salón.");
  }
  return { guiaUserId: s.guia };
}

/** Los niños de la sesión que tienen reporte en ella: el ⚠ de la lista del guía. */
export async function reportesDeSesion(
  sessionId: string,
): Promise<{ childPersonId: string; codigo: string; estado: Estado }[]> {
  return queryRows<{ childPersonId: string; codigo: string; estado: Estado }>(
    `SELECT DISTINCT ON (r.child_person_id) r.child_person_id AS "childPersonId", c.codigo, c.estado
       FROM casos_reporte r JOIN casos_caso c ON c.id = r.caso_id
      WHERE r.session_id = $1
      ORDER BY r.child_person_id, r.created_at DESC`,
    [sessionId],
  );
}

// —— Gestionar ———————————————————————————————————————————————————————————

/** Servicio ASIGNA el caso a un área (o Servicio Académico lo escala a Dirección). */
export async function asignarCaso(input: {
  actorUserId: string;
  casoId: string;
  area: Area;
  comentario: string;
  countryScope: string[] | null;
  ip?: string | null;
}): Promise<void> {
  if (!AREAS.includes(input.area)) throw new ValidationError("Área inválida.");
  const comentario = exigirTexto(input.comentario, "el comentario de la asignación");
  const c = await withTransaction(async (tx) => {
    const caso = await casoParaCambiar(tx, input.casoId, input.countryScope);
    const problema = problemaTransicion(caso, { tipo: "ASIGNAR", area: input.area });
    if (problema !== null) throw new ConflictError(problema);
    const nuevo = ESTADO_AL_ASIGNAR[input.area];
    await execute(
      `UPDATE casos_caso SET estado = $2, area = $3, updated_at = now() WHERE id = $1`,
      [caso.id, nuevo, input.area],
      tx,
    );
    await execute(
      `INSERT INTO casos_seguimiento
         (id, caso_id, tipo, estado_anterior, estado_nuevo, area, texto, autor)
       VALUES ($1, $2, 'ESTADO', $3, $4, $5, $6, $7)`,
      [newId(), caso.id, caso.estado, nuevo, input.area, comentario, input.actorUserId],
      tx,
    );
    return caso;
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "casos.caso_asignado",
    entidad: "casos_caso",
    entidadId: input.casoId,
    payload: { codigo: c.codigo, de: c.area, a: input.area },
    ip: input.ip ?? null,
  });
}

/**
 * CIERRA el caso con la conclusión (obligatoria) y, salvo "sin contacto", el
 * acuerdo con la familia (si no estaba guardado, viene aquí). "No continúa" es
 * informativo: no toca contrato ni matrícula.
 */
export async function cerrarCaso(input: {
  actorUserId: string;
  casoId: string;
  estado: Estado;
  conclusion: string;
  noContinua?: boolean;
  acuerdo?: string | null;
  fechaCompromiso?: string | null;
  countryScope: string[] | null;
  ip?: string | null;
}): Promise<void> {
  const conclusion = exigirTexto(input.conclusion, "la conclusión del caso");
  if (input.fechaCompromiso != null && !/^\d{4}-\d{2}-\d{2}$/.test(input.fechaCompromiso)) {
    throw new ValidationError("La fecha de compromiso debe ser YYYY-MM-DD.");
  }
  const c = await withTransaction(async (tx) => {
    const caso = await casoParaCambiar(tx, input.casoId, input.countryScope);
    const problema = problemaTransicion(caso, { tipo: "CERRAR", estado: input.estado });
    if (problema !== null) throw new ConflictError(problema);
    const acuerdo =
      input.acuerdo != null && input.acuerdo.trim() !== "" ? input.acuerdo.trim() : caso.acuerdo;
    const sinAcuerdo = problemaCierre(input.estado, acuerdo);
    if (sinAcuerdo !== null) throw new ValidationError(sinAcuerdo);
    await execute(
      `UPDATE casos_caso
          SET estado = $2, acuerdo = $3, fecha_compromiso = COALESCE($4::date, fecha_compromiso),
              no_continua = $5, cerrado_por = $6, cerrado_en = now(), updated_at = now()
        WHERE id = $1`,
      [
        caso.id,
        input.estado,
        acuerdo,
        input.fechaCompromiso ?? null,
        input.noContinua === true,
        input.actorUserId,
      ],
      tx,
    );
    await execute(
      `INSERT INTO casos_seguimiento
         (id, caso_id, tipo, estado_anterior, estado_nuevo, area, texto, autor)
       VALUES ($1, $2, 'ESTADO', $3, $4, $5, $6, $7)`,
      [
        newId(),
        caso.id,
        caso.estado,
        input.estado,
        caso.area,
        input.noContinua === true ? `[El niño NO continúa con el curso] ${conclusion}` : conclusion,
        input.actorUserId,
      ],
      tx,
    );
    return caso;
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "casos.caso_cerrado",
    entidad: "casos_caso",
    entidadId: input.casoId,
    payload: { codigo: c.codigo, estado: input.estado, noContinua: input.noContinua === true },
    ip: input.ip ?? null,
  });
}

/** Guarda acuerdo, fecha de compromiso y responsable (lo que venga). Caso abierto. */
export async function guardarGestion(input: {
  actorUserId: string;
  casoId: string;
  acuerdo?: string | null | undefined;
  fechaCompromiso?: string | null | undefined;
  responsable?: string | null | undefined;
  countryScope: string[] | null;
}): Promise<void> {
  if (input.fechaCompromiso != null && !/^\d{4}-\d{2}-\d{2}$/.test(input.fechaCompromiso)) {
    throw new ValidationError("La fecha de compromiso debe ser YYYY-MM-DD.");
  }
  await withTransaction(async (tx) => {
    const caso = await casoParaCambiar(tx, input.casoId, input.countryScope);
    if (cierraElCaso(caso.estado))
      throw new ConflictError("El caso está cerrado: es de solo lectura.");
    // Lo que no vino, no se toca; lo que vino vacío, se borra.
    const vacio = (v: string | null | undefined) =>
      v == null || v.trim() === "" ? null : v.trim();
    await execute(
      `UPDATE casos_caso
          SET acuerdo = CASE WHEN $2 THEN $3 ELSE acuerdo END,
              fecha_compromiso = CASE WHEN $4 THEN $5::date ELSE fecha_compromiso END,
              responsable = CASE WHEN $6 THEN $7 ELSE responsable END,
              updated_at = now()
        WHERE id = $1`,
      [
        caso.id,
        input.acuerdo !== undefined,
        vacio(input.acuerdo),
        input.fechaCompromiso !== undefined,
        vacio(input.fechaCompromiso),
        input.responsable !== undefined,
        vacio(input.responsable),
      ],
      tx,
    );
  });
}

/** Un intento de contacto con la familia. Numerado por canal; caso abierto. */
export async function agregarContacto(input: {
  actorUserId: string;
  casoId: string;
  canal: Canal;
  resultado: Resultado;
  observacion?: string | null;
  countryScope: string[] | null;
}): Promise<{ intento: number }> {
  const observacion = input.observacion?.trim() ?? "";
  if (observacion.length > LARGO_TEXTO)
    throw new ValidationError("La observación es demasiado larga.");
  return withTransaction(async (tx) => {
    const caso = await casoParaCambiar(tx, input.casoId, input.countryScope);
    if (cierraElCaso(caso.estado))
      throw new ConflictError("El caso está cerrado: es de solo lectura.");
    const n = await queryOne<{ n: number }>(
      `SELECT COALESCE(max(intento), 0)::int + 1 AS n FROM casos_contacto
        WHERE caso_id = $1 AND canal = $2`,
      [caso.id, input.canal],
      tx,
    );
    const intento = n?.n ?? 1;
    await execute(
      `INSERT INTO casos_contacto (id, caso_id, canal, intento, resultado, observacion, autor)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newId(),
        caso.id,
        input.canal,
        intento,
        input.resultado,
        observacion === "" ? null : observacion,
        input.actorUserId,
      ],
      tx,
    );
    await execute(`UPDATE casos_caso SET updated_at = now() WHERE id = $1`, [caso.id], tx);
    return { intento };
  });
}

/** Una nota de seguimiento. Caso abierto. */
export async function agregarNota(input: {
  actorUserId: string;
  casoId: string;
  texto: string;
  countryScope: string[] | null;
}): Promise<void> {
  const texto = exigirTexto(input.texto, "la nota", 2);
  await withTransaction(async (tx) => {
    const caso = await casoParaCambiar(tx, input.casoId, input.countryScope);
    if (cierraElCaso(caso.estado))
      throw new ConflictError("El caso está cerrado: es de solo lectura.");
    await execute(
      `INSERT INTO casos_seguimiento (id, caso_id, tipo, texto, autor)
       VALUES ($1, $2, 'NOTA', $3, $4)`,
      [newId(), caso.id, texto, input.actorUserId],
      tx,
    );
    await execute(`UPDATE casos_caso SET updated_at = now() WHERE id = $1`, [caso.id], tx);
  });
}

// —— Leer ————————————————————————————————————————————————————————————————

/** Contexto DERIVADO del niño: su matrícula viva y su apoderado. */
const CONTEXTO_NINO = `
       JOIN people_person b ON b.id = c.child_person_id
       LEFT JOIN identity_user u ON u.id = b.user_id
       LEFT JOIN LATERAL (
            SELECT ca.id AS campaign_id, ca.nombre AS campania, co.tipo::text AS curso,
                   cl.id AS classroom_id, cl.nombre AS salon, cl.guia_user_id
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
       LEFT JOIN contracts_contract k ON k.id = c.contract_id`;

const COLUMNAS_FILA = `
       c.id, c.codigo, c.tema, c.estado, c.area, c.origen, c.numero_caso AS "numeroCaso",
       c.abierto_en AS "abiertoEn", c.cerrado_en AS "cerradoEn", c.no_continua AS "noContinua",
       c.child_person_id AS "childPersonId", b.nombres || ' ' || b.apellidos AS nombre,
       b.doc_numero AS documento, u.username, b.country_code AS pais,
       m.campania, m.curso, m.salon,
       CASE WHEN m.guia_user_id IS NULL THEN NULL ELSE ${nombreDe("m.guia_user_id")} END AS guia,
       ap.nombre AS apoderado, COALESCE(ap.telefono, b.telefono) AS telefono,
       k.external_ref AS "externalRef", k.numero AS "contratoNumero",
       (SELECT count(*) FROM casos_reporte r WHERE r.caso_id = c.id)::int AS reportes,
       (SELECT count(*) FROM casos_reporte r WHERE r.caso_id = c.id AND r.leido_en IS NULL)::int
         AS "sinLeer",
       (SELECT s.texto FROM casos_seguimiento s WHERE s.caso_id = c.id
         ORDER BY s.created_at DESC LIMIT 1) AS "ultimoMovimiento"`;

export interface FilaCaso {
  id: string;
  codigo: string;
  tema: Tema;
  estado: Estado;
  area: Area | null;
  origen: Origen;
  numeroCaso: number;
  abiertoEn: string;
  cerradoEn: string | null;
  noContinua: boolean;
  childPersonId: string;
  nombre: string;
  documento: string;
  username: string | null;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  guia: string | null;
  apoderado: string | null;
  telefono: string | null;
  externalRef: string | null;
  contratoNumero: number | null;
  reportes: number;
  sinLeer: number;
  /** El último texto del seguimiento: al cerrar, la CONCLUSIÓN. */
  ultimoMovimiento: string | null;
}

/** Las bandejas de Servicio › Casos de atención. */
export const VISTAS = ["SIN_ASIGNAR", "ACADEMICO", "DIRECCION", "HISTORICO"] as const;
export type Vista = (typeof VISTAS)[number];

export interface FiltrosBandeja {
  countryScope: string[] | null;
  vista: Vista;
  /** Zona de quien consulta: los días del filtro son los de su reloj. */
  zona: string;
  desde?: string | null;
  hasta?: string | null;
  buscar?: string | null;
  campaignId?: string | null;
  curso?: string | null;
  classroomId?: string | null;
  tema?: Tema | null;
  origen?: Origen | null;
}

const MAX_BANDEJA = 1000;

function condicionesBandeja(f: Omit<FiltrosBandeja, "vista">, values: unknown[]): string[] {
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
  if (f.tema != null) agregar((n) => `c.tema = ${n}`, f.tema);
  if (f.origen != null) agregar((n) => `c.origen = ${n}`, f.origen);
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
                OR upper(regexp_replace(COALESCE(k.external_ref, ''), '[^0-9A-Za-z]', '', 'g')) LIKE ${d}
                OR upper(c.codigo) LIKE ${d}`;
    }
    cond.push(`(${sinTildes("b.nombres")} LIKE ${t} OR ${sinTildes("b.apellidos")} LIKE ${t}
       OR lower(u.username) LIKE ${t} ${porDoc})`);
  }
  return cond;
}

/** La condición de cada bandeja. Abierto = no está en un estado que cierra. */
function condicionVista(vista: Vista): string {
  if (vista === "HISTORICO") return `c.estado IN ${SQL_CIERRAN}`;
  const abierto = `c.estado NOT IN ${SQL_CIERRAN}`;
  return vista === "SIN_ASIGNAR"
    ? `${abierto} AND c.area IS NULL`
    : `${abierto} AND c.area = '${vista}'`;
}

export async function bandejaCasos(f: FiltrosBandeja): Promise<{
  casos: FilaCaso[];
  conteos: Record<Vista, number>;
}> {
  if (!VISTAS.includes(f.vista)) throw new ValidationError("Bandeja inválida.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: f.zona });
  } catch {
    throw new ValidationError("Zona horaria inválida.");
  }
  for (const d of [f.desde, f.hasta]) {
    if (d != null && d !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new ValidationError("Las fechas deben ser YYYY-MM-DD.");
    }
  }
  const values: unknown[] = [];
  const cond = condicionesBandeja(f, values);
  // Abiertos: por cuándo se abrieron. Histórico: por cuándo se cerraron. La
  // zona entra solo si hay fecha: un parámetro sin usar no tiene tipo en Postgres.
  const fechaCol = f.vista === "HISTORICO" ? "c.cerrado_en" : "c.abierto_en";
  const condFecha: string[] = [];
  const conFecha = (f.desde != null && f.desde !== "") || (f.hasta != null && f.hasta !== "");
  let z = "";
  if (conFecha) {
    values.push(f.zona);
    z = `$${String(values.length)}`;
  }
  if (f.desde != null && f.desde !== "") {
    values.push(f.desde);
    condFecha.push(`(${fechaCol} AT TIME ZONE ${z})::date >= $${String(values.length)}::date`);
  }
  if (f.hasta != null && f.hasta !== "") {
    values.push(f.hasta);
    condFecha.push(`(${fechaCol} AT TIME ZONE ${z})::date <= $${String(values.length)}::date`);
  }
  const where = [...cond, ...condFecha];
  const filtro = where.length > 0 ? `AND ${where.join(" AND ")}` : "";
  const casos = await queryRows<FilaCaso>(
    `SELECT ${COLUMNAS_FILA}
       FROM casos_caso c ${CONTEXTO_NINO}
      WHERE ${condicionVista(f.vista)} ${filtro}
      ORDER BY ${f.vista === "HISTORICO" ? "c.cerrado_en DESC" : "c.abierto_en ASC"}
      LIMIT ${String(MAX_BANDEJA)}`,
    values,
  );
  // Los conteos de cada pestaña con los MISMOS filtros (salvo la fecha, que en
  // el histórico mide otra cosa): así el número cuadra con lo que se ve al entrar.
  const vCont: unknown[] = [];
  const condCont = condicionesBandeja(f, vCont);
  const filtroCont = condCont.length > 0 ? `AND ${condCont.join(" AND ")}` : "";
  const fila = await queryOne<Record<Vista, number>>(
    `SELECT ${VISTAS.map((v) => `count(*) FILTER (WHERE ${condicionVista(v)})::int AS "${v}"`).join(
      ", ",
    )}
       FROM casos_caso c ${CONTEXTO_NINO}
      WHERE true ${filtroCont}`,
    vCont,
  );
  return {
    casos,
    conteos: fila ?? { SIN_ASIGNAR: 0, ACADEMICO: 0, DIRECCION: 0, HISTORICO: 0 },
  };
}

/** Los casos de un niño (su ficha), abiertos primero. */
export async function casosDeNino(
  childPersonId: string,
  countryScope: string[] | null,
): Promise<FilaCaso[]> {
  await exigirNino(childPersonId, countryScope);
  return queryRows<FilaCaso>(
    `SELECT ${COLUMNAS_FILA}
       FROM casos_caso c ${CONTEXTO_NINO}
      WHERE c.child_person_id = $1
      ORDER BY (c.estado IN ${SQL_CIERRAN}), c.abierto_en DESC`,
    [childPersonId],
  );
}

export interface EventoSeguimiento {
  tipo: "REPORTE" | "ESTADO" | "NOTA" | "CONTACTO";
  fecha: string;
  autor: string | null;
  texto: string;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  area: string | null;
  canal: string | null;
  intento: number | null;
  resultado: string | null;
  /** Reporte: a nombre de qué guía, y la fecha de su sesión. */
  guia: string | null;
  fechaSesion: string | null;
  tema: string | null;
}

export interface DetalleCaso extends FilaCaso {
  acuerdo: string | null;
  fechaCompromiso: string | null;
  responsable: string | null;
  abiertoPor: string | null;
  cerradoPor: string | null;
  reincidencia: Reincidencia;
  movimientos: number;
  seguimiento: EventoSeguimiento[];
  contactos: { canal: Canal; intento: number; resultado: Resultado; fecha: string }[];
  otros: { id: string; codigo: string; tema: Tema; estado: Estado; abiertoEn: string }[];
}

/**
 * El caso completo. Abrirlo marca como LEÍDOS sus reportes (regla R7 de MOSAICO):
 * quien lo abre es el equipo que lo gestiona.
 */
export async function detalleCaso(
  casoId: string,
  ctx: { actorUserId: string; countryScope: string[] | null },
): Promise<DetalleCaso> {
  const c = await queryOne<
    Omit<DetalleCaso, "reincidencia" | "movimientos" | "seguimiento" | "contactos" | "otros">
  >(
    `SELECT ${COLUMNAS_FILA}, c.acuerdo, c.fecha_compromiso::text AS "fechaCompromiso",
            c.responsable, ${nombreDe("c.abierto_por")} AS "abiertoPor",
            CASE WHEN c.cerrado_por IS NULL THEN NULL ELSE ${nombreDe("c.cerrado_por")} END
              AS "cerradoPor"
       FROM casos_caso c ${CONTEXTO_NINO}
      WHERE c.id = $1`,
    [casoId],
  );
  if (c === null || (ctx.countryScope !== null && !ctx.countryScope.includes(c.pais))) {
    throw new NotFoundError("El caso no existe.");
  }
  await execute(
    `UPDATE casos_reporte SET leido_en = now(), leido_por = $2
      WHERE caso_id = $1 AND leido_en IS NULL`,
    [casoId, ctx.actorUserId],
  );

  const [reportes, seguimiento, contactos, otros, cuenta] = await Promise.all([
    queryRows<EventoSeguimiento>(
      `SELECT 'REPORTE' AS tipo, r.created_at AS fecha, ${nombreDe("r.registrado_por")} AS autor,
              r.texto, NULL AS "estadoAnterior", NULL AS "estadoNuevo", NULL AS area,
              NULL AS canal, NULL::int AS intento, NULL AS resultado,
              CASE WHEN r.guia_user_id IS NULL THEN NULL ELSE ${nombreDe("r.guia_user_id")} END AS guia,
              s.fecha::text AS "fechaSesion", r.tema
         FROM casos_reporte r LEFT JOIN scheduling_session s ON s.id = r.session_id
        WHERE r.caso_id = $1`,
      [casoId],
    ),
    queryRows<EventoSeguimiento>(
      `SELECT x.tipo, x.created_at AS fecha, ${nombreDe("x.autor")} AS autor, x.texto,
              x.estado_anterior AS "estadoAnterior", x.estado_nuevo AS "estadoNuevo", x.area,
              NULL AS canal, NULL::int AS intento, NULL AS resultado, NULL AS guia,
              NULL AS "fechaSesion", NULL AS tema
         FROM casos_seguimiento x WHERE x.caso_id = $1`,
      [casoId],
    ),
    queryRows<EventoSeguimiento & { canal: Canal; resultado: Resultado; intento: number }>(
      `SELECT 'CONTACTO' AS tipo, x.created_at AS fecha, ${nombreDe("x.autor")} AS autor,
              COALESCE(x.observacion, '') AS texto, NULL AS "estadoAnterior",
              NULL AS "estadoNuevo", NULL AS area, x.canal, x.intento, x.resultado,
              NULL AS guia, NULL AS "fechaSesion", NULL AS tema
         FROM casos_contacto x WHERE x.caso_id = $1`,
      [casoId],
    ),
    queryRows<{ id: string; codigo: string; tema: Tema; estado: Estado; abiertoEn: string }>(
      `SELECT id, codigo, tema, estado, abierto_en AS "abiertoEn" FROM casos_caso
        WHERE child_person_id = $1 AND id <> $2 ORDER BY abierto_en DESC`,
      [c.childPersonId, casoId],
    ),
    queryOne<{ reportesNino: number; reportes30: number }>(
      `SELECT count(*)::int AS "reportesNino",
              count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS reportes30
         FROM casos_reporte WHERE child_person_id = $1`,
      [c.childPersonId],
    ),
  ]);

  const linea = [...reportes, ...seguimiento, ...contactos].sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
  );
  const anteriores = otros.filter((o) => new Date(o.abiertoEn) < new Date(c.abiertoEn)).length;
  return {
    ...c,
    // Acaban de quedar leídos: el número tiene que decirlo.
    sinLeer: 0,
    reincidencia: reincidencia({
      reportes: cuenta?.reportesNino ?? 0,
      casosAnteriores: anteriores,
      reportes30Dias: cuenta?.reportes30 ?? 0,
    }),
    movimientos: seguimiento.length + contactos.length,
    seguimiento: linea,
    contactos: contactos.map((x) => ({
      canal: x.canal,
      intento: x.intento,
      resultado: x.resultado,
      fecha: x.fecha,
    })),
    otros,
  };
}
