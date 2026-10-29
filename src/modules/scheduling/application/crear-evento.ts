import type { PoolClient } from "pg";
import { z } from "zod";
import { registrarAuditoria } from "@/modules/audit";
import { descargarArchivo, metaArchivo } from "@/modules/files";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { isValidTimeZone, operationalDate, wallTimeToUtc } from "@/platform/time";
import { diasEntre, fechasTanda, sumarDias } from "../domain/tanda-club";
import { exigirLinkClubParaFecha } from "./link-club";
import { getHolidayDates } from "../infrastructure/scheduling-repository";
import {
  DURACION_ADMIN_MAX,
  DURACION_ADMIN_MIN,
  type TipoEventoAdmin,
  esTipoEventoAdmin,
} from "../domain/evento-admin";
import { MENSAJE_ZOOM_INVALIDO, esSalaZoomValida, normalizarSalaZoom } from "../domain/zoom-link";

/**
 * Evento creado A MANO desde el calendario (sesión extra, club o taller).
 *
 * Se diferencia de las sesiones generadas en que NO tiene slot: no nace del
 * horario recurrente del salón. Por eso `deleteSessions` lo respeta y
 * regenerar el curso no lo borra.
 *
 * El enlace de Zoom NO se escribe aquí: se hereda del guía asignado
 * (`scheduling_guia.zoom_url`). Un guía dicta siempre desde su propia sala, y
 * copiarlo a mano en cada evento acabaría con enlaces desactualizados.
 */

export type TipoEvento = "SESION" | "CLUB" | "TALLER";

/**
 * Duraciones válidas de un TALLER: una o dos horas.
 *
 * El taller no es una clase larga ni un club: es una actividad acotada que el
 * negocio programa en bloques de hora. Sesiones y clubes siguen con el rango
 * abierto porque los fija el horario del salón.
 */
export const DURACIONES_TALLER = [60, 120];

/** Máximo de salones que puede compartir un mismo evento. */
export const MAX_SALONES_COMPARTIDOS = 3;

export interface EventoCreado {
  /** El grupo de la (primera) clase compartida, si se dicta en varios salones. */
  grupoId: string | null;
  /** La tanda, si es un Club que se repite cada semana. */
  tandaId: string | null;
  sesiones: { id: string; classroomId: string; salon: string }[];
}

export interface GuiaConZoom {
  id: string;
  username: string;
  /** Nombre de su ficha de guía; el usuario generado si todavía no la llenó. */
  nombre: string;
  zoomUrl: string | null;
}

/**
 * Guías activos con su enlace de Zoom, para el selector del formulario. Por su
 * NOMBRE: el usuario generado (`atrochez8939`) no le dice a nadie quién es.
 */
export async function guiasConZoom(): Promise<GuiaConZoom[]> {
  return queryRows<GuiaConZoom>(
    `SELECT u.id, u.username,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', g.nombres, g.apellidos)), ''), u.username) AS nombre,
            g.zoom_url AS "zoomUrl"
       FROM identity_user u
       JOIN access_user_role ur ON ur.user_id = u.id
       JOIN access_role r ON r.id = ur.role_id
       LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
      WHERE r.code = 'guia' AND u.estado = 'ACTIVO'
      GROUP BY u.id, u.username, g.nombres, g.apellidos, g.zoom_url
      ORDER BY nombre`,
  );
}

export interface FichaGuia {
  guiaUserId: string;
  username: string;
  nombres: string | null;
  apellidos: string | null;
  docNumero: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  domicilio: string | null;
  fechaNacimiento: string | null;
  zoomUrl: string | null;
  fotoFileId: string | null;
  /** Salones ACTIVOS que tiene asignados (el guía del salón, no los reemplazos). */
  salonesActivos: number;
  /** Estado de su CUENTA: un guía desactivado no entra al panel. */
  estado: "ACTIVO" | "INACTIVO";
}

/**
 * La cuenta es de un guía y SOLO de guía. Activarlo o desactivarlo desde su
 * ficha basta con `usuarios.gestionar` (lo que pide administrar a un guía); una
 * cuenta que además es staff se administra en Usuarios y roles, donde se exige
 * lo que pide su rol más alto.
 */
export async function exigirSoloGuia(userId: string): Promise<void> {
  const r = await queryOne<{ guia: boolean; otros: boolean }>(
    `SELECT bool_or(r.code = 'guia') AS guia, bool_or(r.code <> 'guia') AS otros
       FROM access_user_role ur JOIN access_role r ON r.id = ur.role_id
      WHERE ur.user_id = $1`,
    [userId],
  );
  if (r?.guia !== true) throw new NotFoundError("No es un guía.");
  if (r.otros) {
    throw new ConflictError(
      "Esta cuenta tiene además otros roles: actívala o desactívala en Usuarios y roles.",
    );
  }
}

/** Ficha operativa de todos los guías, activos primero. */
export async function fichasDeGuias(): Promise<FichaGuia[]> {
  return queryRows<FichaGuia>(
    `SELECT u.id AS "guiaUserId", u.username,
            g.nombres, g.apellidos, g.doc_numero AS "docNumero", g.email, g.telefono,
            g.pais, g.domicilio, g.fecha_nacimiento::text AS "fechaNacimiento",
            g.zoom_url AS "zoomUrl", g.foto_file_id AS "fotoFileId",
            (SELECT count(*)::int FROM scheduling_classroom c
              WHERE c.guia_user_id = u.id AND c.activo) AS "salonesActivos",
            u.estado
       FROM identity_user u
       JOIN access_user_role ur ON ur.user_id = u.id
       JOIN access_role r ON r.id = ur.role_id
       LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
      WHERE r.code = 'guia'
      GROUP BY u.id, u.username, u.estado, g.nombres, g.apellidos, g.doc_numero, g.email,
               g.telefono, g.pais, g.domicilio, g.fecha_nacimiento, g.zoom_url, g.foto_file_id
      ORDER BY u.estado = 'ACTIVO' DESC, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', g.nombres, g.apellidos)), ''), u.username)`,
  );
}

/**
 * Foto del guía, para pintarla junto a su nombre.
 *
 * Va por el id del GUÍA, no por el del archivo: `files` guarda también fotos de
 * niños y arte, y una ruta que sirviera cualquier id de `files` con la sesión de
 * quien abra el enlace es exactamente la trampa que ya se pagó con
 * `/api/catalog/imagen-curso/[id]`. Aquí solo sale el archivo al que apunta ESE
 * guía, y solo si es una imagen.
 */
export async function fotoDeGuia(
  guiaUserId: string,
): Promise<{ meta: { mime: string }; bytes: Buffer }> {
  const row = await queryOne<{ fotoFileId: string | null }>(
    `SELECT foto_file_id AS "fotoFileId" FROM scheduling_guia WHERE guia_user_id = $1`,
    [guiaUserId],
  );
  if (row?.fotoFileId == null) throw new NotFoundError("El guía no tiene foto.");
  const meta = await metaArchivo(row.fotoFileId);
  if (meta === null || !meta.mime.startsWith("image/")) {
    throw new NotFoundError("El guía no tiene foto.");
  }
  return descargarArchivo(row.fotoFileId);
}

/**
 * Guarda la ficha del guía. Replica el alta de MOSAICO (/nuevo-guia): mismos
 * campos y las MISMAS dos validaciones del enlace de Zoom, que allí costaron
 * clases perdidas — se normaliza el enlace de anfitrión y se rechaza el de
 * chat, y además se exige que no lo comparta con otro guía.
 */
export async function guardarFichaGuia(input: {
  actorUserId: string;
  guiaUserId: string;
  nombres?: string | null;
  apellidos?: string | null;
  docNumero?: string | null;
  email?: string | null;
  telefono?: string | null;
  pais?: string | null;
  domicilio?: string | null;
  fechaNacimiento?: string | null;
  zoomUrl?: string | null;
  fotoFileId?: string | null;
  ip?: string | null;
  /** Para guardarla dentro de una transacción ya abierta (wizard público). */
  client?: PoolClient;
}): Promise<void> {
  const zoomCrudo = (input.zoomUrl ?? "").trim();
  let zoom: string | null = null;
  if (zoomCrudo !== "") {
    if (!esSalaZoomValida(zoomCrudo)) throw new ValidationError(MENSAJE_ZOOM_INVALIDO);
    zoom = normalizarSalaZoom(zoomCrudo);

    // El enlace de la clase ES la sala del guía: si dos lo comparten, dos
    // grupos distintos acabarían en la misma reunión.
    const dueno = await queryOne<{ guia_user_id: string; username: string }>(
      `SELECT g.guia_user_id, u.username
         FROM scheduling_guia g
         JOIN identity_user u ON u.id = g.guia_user_id
        WHERE TRIM(g.zoom_url) = TRIM($1) AND g.guia_user_id <> $2
        LIMIT 1`,
      [zoom, input.guiaUserId],
      input.client,
    );
    if (dueno !== null) {
      throw new ConflictError(`Esa sala de Zoom ya es de ${dueno.username}.`);
    }
  }

  // `fotoFileId` sin venir = la foto no se toca. Antes se escribía NULL: editar
  // la ficha desde Guías (que no manda la foto) borraba la que el guía subió.
  await execute(
    `INSERT INTO scheduling_guia
       (guia_user_id, nombres, apellidos, doc_numero, email, telefono, pais,
        domicilio, fecha_nacimiento, zoom_url, foto_file_id, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, now())
     ON CONFLICT (guia_user_id) DO UPDATE
        SET nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos,
            doc_numero = EXCLUDED.doc_numero, email = EXCLUDED.email,
            telefono = EXCLUDED.telefono, pais = EXCLUDED.pais,
            domicilio = EXCLUDED.domicilio, fecha_nacimiento = EXCLUDED.fecha_nacimiento,
            zoom_url = EXCLUDED.zoom_url,
            foto_file_id = CASE WHEN $12 THEN EXCLUDED.foto_file_id
                                ELSE scheduling_guia.foto_file_id END,
            actualizado_en = now()`,
    [
      input.guiaUserId,
      input.nombres ?? null,
      input.apellidos ?? null,
      input.docNumero?.trim().toUpperCase() ?? null,
      input.email?.trim().toLowerCase() ?? null,
      input.telefono ?? null,
      input.pais ?? null,
      input.domicilio ?? null,
      input.fechaNacimiento === "" ? null : (input.fechaNacimiento ?? null),
      zoom,
      input.fotoFileId ?? null,
      input.fotoFileId !== undefined,
    ],
    input.client,
  );

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.ficha_guia_guardada",
    entidad: "identity_user",
    entidadId: input.guiaUserId,
    payload: { tieneZoom: zoom !== null },
    ip: input.ip ?? null,
  });
}

/**
 * Un evento suelto ABIERTO admite niños de otros salones (Academic management ›
 * Agendar, y el propio niño en Inscripción Clubes) si coinciden con su campaña,
 * curso, país y salón —y con el NIVEL del evento—; null = "Todos". Cerrado, su
 * lista son solo los niños de los salones donde se dicta.
 */
export interface AperturaEvento {
  abierto: boolean;
  campaignId: string | null;
  curso: "JUNIOR" | "YOUNGSTER" | null;
  /** País del salón del niño (su calendario de feriados). */
  pais: "CL" | "CO" | "EC" | "PE" | null;
  classroomId: string | null;
}

const CERRADO: AperturaEvento = {
  abierto: false,
  campaignId: null,
  curso: null,
  pais: null,
  classroomId: null,
};

/** La forma de la apertura en las rutas de crear y editar (null = "Todos"). */
export const ESQUEMA_APERTURA = z.object({
  abierto: z.boolean(),
  campaignId: z.uuid().nullable(),
  curso: z.enum(["JUNIOR", "YOUNGSTER"]).nullable(),
  // Opcional: una pantalla anterior al país lo omite y vale "Todos".
  pais: z.enum(["CL", "CO", "EC", "PE"]).nullable().default(null),
  classroomId: z.uuid().nullable(),
});

/**
 * Los salones ACTIVOS de un alcance (null = "Todos"): el evento académico
 * creado con salón "Todos" se dicta, como UNA clase compartida, en todos ellos.
 */
export async function salonesDelAlcance(alcance: {
  campaignId: string | null;
  pais: string | null;
  curso: string | null;
}): Promise<string[]> {
  const filas = await queryRows<{ id: string }>(
    `SELECT cl.id
       FROM scheduling_classroom cl
       JOIN catalog_course co ON co.id = cl.course_id
      WHERE cl.activo
        AND ($1::uuid IS NULL OR co.campaign_id = $1)
        AND ($2::text IS NULL OR cl.holiday_country = $2)
        AND ($3::text IS NULL OR co.tipo::text = $3)
      ORDER BY cl.nombre`,
    [alcance.campaignId, alcance.pais, alcance.curso],
  );
  return filas.map((f) => f.id);
}

export async function crearEvento(input: {
  actorUserId: string;
  /** Salones donde se dicta. Más de uno = evento compartido entre cursos. */
  classroomIds: string[];
  tipo: TipoEvento;
  /** Fecha local del salón, YYYY-MM-DD. */
  fecha: string;
  /** Hora de pared del salón, HH:MM. */
  horaLocal: string;
  duracionMin: number;
  nivel?: string | null;
  limiteUsuarios?: number | null;
  guiaUserId: string;
  observaciones?: string | null;
  /** Abierto a niños de OTROS salones que coincidan con el alcance (Agendar). */
  apertura?: AperturaEvento;
  /**
   * Zona IANA en la que está escrita la hora. Sin ella, la del primer salón.
   * El evento para "todos" los salones la manda: puede cruzar países.
   */
  zona?: string;
  /** Salones resueltos por `salonesDelAlcance` ("Todos"): sin tope de compartidos. */
  todos?: boolean;
  /**
   * Solo CLUB: TANDA — el Club se repite cada semana (el día de `fecha`) entre
   * el inicio y el final. Cada semana es una sesión (compartida si hay varios
   * salones); los feriados de cada salón y las fechas ya pasadas se saltan.
   */
  tanda?: { inicio: string; fin: string } | null;
  /**
   * Solo CLUB: "Link diferente al del Advisor" — un link de `scheduling_link_club`
   * del MISMO día de la semana que `fecha`. Manda sobre la sala del guía.
   */
  linkClubId?: string | null;
  ip?: string | null;
  /** Para crearlo dentro de una transacción ya abierta (aprobar un refuerzo). */
  client?: PoolClient;
}): Promise<EventoCreado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    throw new ValidationError("La fecha debe ser YYYY-MM-DD.");
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.horaLocal)) {
    throw new ValidationError("La hora debe ser HH:MM.");
  }
  if (input.duracionMin < 15 || input.duracionMin > 300) {
    throw new ValidationError("La duración debe estar entre 15 y 300 minutos.");
  }
  if (input.tipo === "TALLER" && !DURACIONES_TALLER.includes(input.duracionMin)) {
    throw new ValidationError("Un taller dura una o dos horas.");
  }
  const salones = [...new Set(input.classroomIds)];
  if (salones.length === 0) {
    throw new ValidationError(
      input.todos === true
        ? "Ningún salón activo coincide con esa campaña, país y curso."
        : "Elige al menos un salón.",
    );
  }
  if (input.todos !== true && salones.length > MAX_SALONES_COMPARTIDOS) {
    throw new ValidationError(
      `Un evento compartido admite hasta ${String(MAX_SALONES_COMPARTIDOS)} salones.`,
    );
  }
  if (input.zona !== undefined && !isValidTimeZone(input.zona)) {
    throw new ValidationError(`Zona horaria desconocida: ${input.zona}.`);
  }
  const tanda = input.tanda ?? null;
  if (tanda !== null && input.tipo !== "CLUB") {
    throw new ValidationError("Solo un Club se crea por tanda.");
  }
  const linkClubId = input.linkClubId ?? null;
  if (linkClubId !== null && input.tipo !== "CLUB") {
    throw new ValidationError("Solo un Club lleva un link diferente al del advisor.");
  }
  let semanas = [input.fecha];
  if (tanda !== null) {
    const r = fechasTanda({ fecha: input.fecha, inicio: tanda.inicio, fin: tanda.fin });
    if (r.problema !== null) throw new ValidationError(r.problema);
    semanas = r.fechas;
  }

  // El enlace de Zoom sale del guía; si no lo tiene, el evento se crea igual
  // pero sin enlace: bloquear la creación por eso sería peor que avisarlo.
  const guia = await queryOne<{ id: string; zoom_url: string | null }>(
    `SELECT u.id, g.zoom_url
       FROM identity_user u
       LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
      WHERE u.id = $1 AND u.estado = 'ACTIVO'`,
    [input.guiaUserId],
  );
  if (guia === null) throw new NotFoundError("El guía no existe o está inactivo.");

  // Un evento compartido es UNA clase dictada en varios salones: comparte
  // grupo para que el conteo del guía no la cuente varias veces. En una tanda,
  // cada SEMANA es su propia clase compartida (su propio grupo).
  const compartido = salones.length > 1;
  const tandaId = tanda !== null ? newId() : null;
  const apertura = input.apertura ?? CERRADO;
  const creadas: EventoCreado["sesiones"] = [];
  let primerGrupo: string | null = null;

  const insertar = async (tx: PoolClient) => {
    const filas: {
      id: string;
      nombre: string;
      timezone: string;
      cupo: number;
      pais: string;
    }[] = [];
    for (const classroomId of salones) {
      const salon = await queryOne<{
        id: string;
        nombre: string;
        timezone: string;
        cupo: number;
        pais: string;
      }>(
        `SELECT id, nombre, timezone, cupo, holiday_country AS pais
           FROM scheduling_classroom WHERE id = $1 AND activo`,
        [classroomId],
        tx,
      );
      if (salon === null) {
        throw new NotFoundError("Un salón no existe o está desactivado.");
      }
      filas.push(salon);
    }
    // El link del Club: activo y del día de la semana de la fecha (en una tanda
    // todas las semanas caen ese mismo día).
    if (linkClubId !== null) await exigirLinkClubParaFecha(linkClubId, input.fecha, tx);

    // UNA clase es UN instante, aunque se dicte en salones de zonas distintas
    // (el guía no puede estar en dos horas a la vez). La hora es de PARED en la
    // zona de quien la escribe si la manda (evento para "todos" los salones) o,
    // si no, en la del primer salón (ADR-0007). Cada salón guarda su fecha local.
    const [hh, mm] = input.horaLocal.split(":");
    const zona = input.zona ?? filas[0]?.timezone ?? "UTC";
    const instante = (fecha: string) => {
      const [y, m, d] = fecha.split("-");
      return wallTimeToUtc(
        { year: Number(y), month: Number(m), day: Number(d), hour: Number(hh), minute: Number(mm) },
        zona,
      );
    };

    // En una tanda, los feriados de CADA salón (su país) se saltan para ese
    // salón, y lo que ya pasó no se crea.
    const feriados = new Map<string, Set<string>>();
    if (tanda !== null) {
      for (const pais of new Set(filas.map((f) => f.pais))) {
        feriados.set(
          pais,
          new Set(
            await getHolidayDates(pais, sumarDias(tanda.inicio, -1), sumarDias(tanda.fin, 1), tx),
          ),
        );
      }
    }
    const plan: { startsAt: Date; salon: (typeof filas)[number]; fecha: string }[][] = [];
    for (const semana of semanas) {
      const startsAt = instante(semana);
      if (tanda !== null && startsAt.getTime() <= Date.now()) continue;
      const enSemana = filas
        .map((salon) => ({ startsAt, salon, fecha: operationalDate(startsAt, salon.timezone) }))
        .filter((x) => tanda === null || !(feriados.get(x.salon.pais)?.has(x.fecha) ?? false));
      if (enSemana.length > 0) plan.push(enSemana);
    }
    if (plan.length === 0) {
      throw new ValidationError(
        "La tanda no deja ninguna semana por delante (todo ya pasó o es feriado).",
      );
    }

    const choques = await queryRows<{ nombre: string; startsAt: Date }>(
      `SELECT cl.nombre, s.starts_at AS "startsAt" FROM scheduling_session s
         JOIN scheduling_classroom cl ON cl.id = s.classroom_id
        WHERE s.classroom_id = ANY($1::uuid[]) AND s.starts_at = ANY($2::timestamptz[])
        ORDER BY s.starts_at, cl.nombre`,
      [salones, plan.map((p) => p[0]?.startsAt)],
      tx,
    );
    if (choques.length > 0) {
      const ejemplo = choques
        .slice(0, 5)
        .map((c) =>
          tanda !== null
            ? `${c.nombre} (${operationalDate(new Date(c.startsAt), zona)})`
            : c.nombre,
        )
        .join(", ");
      throw new ConflictError(
        `Ya hay ${choques.length === 1 ? "un evento" : `${String(choques.length)} eventos`} a esa hora: ${ejemplo}${choques.length > 5 ? "…" : ""}.`,
      );
    }

    if (tandaId !== null && tanda !== null) {
      await execute(
        `INSERT INTO scheduling_tanda_club (id, inicio, fin, creado_por)
         VALUES ($1, $2::date, $3::date, $4)`,
        [tandaId, tanda.inicio, tanda.fin, input.actorUserId],
        tx,
      );
    }

    for (const enSemana of plan) {
      const grupoId = compartido ? newId() : null;
      primerGrupo ??= grupoId;
      for (const { startsAt, salon, fecha } of enSemana) {
        await insertarSesion(tx, salon, startsAt, fecha, grupoId);
      }
    }
  };

  const insertarSesion = async (
    tx: PoolClient,
    salon: { id: string; nombre: string; cupo: number },
    startsAt: Date,
    fecha: string,
    grupoId: string | null,
  ) => {
    {
      const classroomId = salon.id;
      const id = newId();
      await execute(
        `INSERT INTO scheduling_session
           (id, classroom_id, slot_id, tipo, fecha, starts_at, duracion_min, numero,
            guia_user_id, nivel, observaciones, limite_usuarios, grupo_id,
            abierto, alcance_campaign_id, alcance_curso, alcance_classroom_id, tanda_id,
            link_club_id, alcance_pais)
         VALUES ($1, $2, NULL, $3::scheduling_slot_tipo, $4::date, $5, $6, 0,
                 $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          id,
          classroomId,
          input.tipo,
          fecha,
          startsAt,
          input.duracionMin,
          input.guiaUserId,
          input.nivel ?? null,
          input.observaciones?.trim() === "" ? null : (input.observaciones ?? null),
          input.limiteUsuarios ?? salon.cupo,
          grupoId,
          apertura.abierto,
          apertura.abierto ? apertura.campaignId : null,
          apertura.abierto ? apertura.curso : null,
          apertura.abierto ? apertura.classroomId : null,
          tandaId,
          linkClubId,
          apertura.abierto ? apertura.pais : null,
        ],
        tx,
      );
      creadas.push({ id, classroomId, salon: salon.nombre });
    }
  };
  if (input.client !== undefined) await insertar(input.client);
  else await withTransaction(insertar);

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.evento_creado",
    entidad: "scheduling_session",
    entidadId: creadas[0]?.id ?? null,
    payload: {
      tipo: input.tipo,
      fecha: input.fecha,
      hora: input.horaLocal,
      salones: [...new Set(creadas.map((c) => c.salon))],
      compartido,
      todos: input.todos === true,
      ...(tanda !== null && { tandaId, tanda, sesiones: creadas.length }),
      ...(linkClubId !== null && { linkClubId }),
      conZoom: linkClubId !== null || (guia.zoom_url !== null && guia.zoom_url !== ""),
    },
    ip: input.ip ?? null,
  });

  return { grupoId: primerGrupo, tandaId, sesiones: creadas };
}

/**
 * EDITA un evento creado a mano en el calendario (sesión extra, club, taller o
 * refuerzo: los que NO nacen del horario del salón). Los niños inscritos se
 * mantienen: la lista sale de las matrículas del salón, no del evento.
 *
 * Un evento COMPARTIDO entre salones es UNA clase: se edita en todos sus salones
 * a la vez (misma hora de pared en la zona de cada uno, como al crearlo). El
 * salón no se cambia aquí. Uno ya CERRADO (dictado y registrado) no se mueve: su
 * registro dice cuándo ocurrió.
 */
export async function editarEvento(input: {
  actorUserId: string;
  sessionId: string;
  tipo: TipoEvento;
  fecha: string;
  horaLocal: string;
  duracionMin: number;
  nivel?: string | null;
  limiteUsuarios?: number | null;
  guiaUserId: string;
  observaciones?: string | null;
  /** Sin esto, la apertura que tenía se conserva. */
  apertura?: AperturaEvento;
  /**
   * Club de una TANDA: aplica el cambio a todas sus sesiones FUTURAS sin cerrar
   * (lo ya dictado no se toca). La fecha nueva corre TODA la tanda los mismos
   * días; la hora y lo demás se ponen igual en todas.
   */
  todaLaTanda?: boolean;
  /**
   * Link propio del Club: un id, null = vuelve a la sala del advisor; sin esto
   * se conserva el que tenía. Un evento que deja de ser Club lo pierde.
   */
  linkClubId?: string | null;
  ip?: string | null;
}): Promise<{ sesiones: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    throw new ValidationError("La fecha debe ser YYYY-MM-DD.");
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.horaLocal)) {
    throw new ValidationError("La hora debe ser HH:MM.");
  }
  if (input.duracionMin < 15 || input.duracionMin > 300) {
    throw new ValidationError("La duración debe estar entre 15 y 300 minutos.");
  }
  if (input.tipo === "TALLER" && !DURACIONES_TALLER.includes(input.duracionMin)) {
    throw new ValidationError("Un taller dura una o dos horas.");
  }
  const sesion = await queryOne<{
    id: string;
    slotId: string | null;
    grupoId: string | null;
    tandaId: string | null;
    linkClubId: string | null;
  }>(
    `SELECT id, slot_id AS "slotId", grupo_id AS "grupoId", tanda_id AS "tandaId",
            link_club_id AS "linkClubId"
       FROM scheduling_session WHERE id = $1`,
    [input.sessionId],
  );
  if (sesion === null) throw new NotFoundError("El evento no existe.");
  const enTanda = input.todaLaTanda === true && sesion.tandaId !== null;
  if (sesion.slotId !== null) {
    throw new ConflictError(
      "Esta es una clase del horario del salón: se mueve con una suspensión, no se edita.",
    );
  }
  const guia = await queryOne<{ id: string }>(
    `SELECT id FROM identity_user WHERE id = $1 AND estado = 'ACTIVO'`,
    [input.guiaUserId],
  );
  if (guia === null) throw new NotFoundError("El guía no existe o está inactivo.");

  if (input.tipo !== "CLUB" && input.linkClubId !== undefined && input.linkClubId !== null) {
    throw new ValidationError("Solo un Club lleva un link diferente al del advisor.");
  }
  const [hh, mm] = input.horaLocal.split(":");
  let editadas = 0;
  const antes: unknown[] = [];
  await withTransaction(async (tx) => {
    if (input.tipo === "CLUB" && input.linkClubId !== undefined && input.linkClubId !== null) {
      // El que ya tenía vale aunque se haya desactivado: cambiar el advisor (o la
      // hora) de un Club con link propio no le cambia el link.
      await exigirLinkClubParaFecha(
        input.linkClubId,
        input.fecha,
        tx,
        input.linkClubId === sesion.linkClubId,
      );
    }
    // El evento y, si es compartido, sus hermanos de grupo. En "toda la tanda",
    // además todas las semanas FUTURAS de la tanda que no se hayan cerrado.
    let filas = await queryRows<{
      id: string;
      classroomId: string;
      salon: string;
      timezone: string;
      cupo: number;
      cerradaEn: string | null;
      startsAt: Date;
      guiaUserId: string | null;
    }>(
      `SELECT s.id, s.classroom_id AS "classroomId", cl.nombre AS salon, cl.timezone, cl.cupo,
              s.cerrada_en AS "cerradaEn", s.starts_at AS "startsAt",
              s.guia_user_id AS "guiaUserId"
         FROM scheduling_session s JOIN scheduling_classroom cl ON cl.id = s.classroom_id
        WHERE s.slot_id IS NULL
          AND (s.id = $1 OR ($2::uuid IS NOT NULL AND s.grupo_id = $2)
               OR ($3::uuid IS NOT NULL AND s.tanda_id = $3 AND s.starts_at > now()
                   AND s.cerrada_en IS NULL))
        ORDER BY s.starts_at
        FOR UPDATE OF s`,
      [sesion.id, sesion.grupoId, enTanda ? sesion.tandaId : null],
      tx,
    );
    const editada = filas.find((f) => f.id === sesion.id);
    if (filas.some((f) => f.cerradaEn !== null)) {
      throw new ConflictError("El evento ya se dictó y se cerró: no se puede editar.");
    }
    // UNA clase es UN instante: la hora está escrita en el reloj del salón del
    // evento que se abrió, y sus hermanos (quizá en otra zona) la siguen. La
    // FECHA nueva corre cada sesión los mismos días que la editada (en una
    // tanda, toda la serie; en un evento suelto, todos caen en esa fecha).
    const zona = editada?.timezone ?? filas[0]?.timezone ?? "UTC";
    const dias = diasEntre(
      operationalDate(new Date(editada?.startsAt ?? Date.now()), zona),
      input.fecha,
    );
    const nuevoInicio = (f: (typeof filas)[number]) => {
      const [y, m, d] = sumarDias(operationalDate(new Date(f.startsAt), zona), dias).split("-");
      return wallTimeToUtc(
        { year: Number(y), month: Number(m), day: Number(d), hour: Number(hh), minute: Number(mm) },
        zona,
      );
    };
    // Al correr la serie hacia adelante, se mueve primero la última (y al revés)
    // para no pisar, ni por un instante, la hora de la semana vecina.
    if (dias > 0) filas = [...filas].reverse();
    const ids = filas.map((f) => f.id);
    const movidas: { classroomId: string; desde: Date; hasta: Date }[] = [];
    for (const f of filas) {
      const startsAt = nuevoInicio(f);
      const choque = await queryOne<{ id: string }>(
        `SELECT id FROM scheduling_session
          WHERE classroom_id = $1 AND starts_at = $2 AND NOT (id = ANY($3::uuid[]))`,
        [f.classroomId, startsAt, ids],
        tx,
      );
      if (choque !== null) {
        throw new ConflictError(
          `${f.salon} ya tiene otro evento el ${operationalDate(startsAt, f.timezone)} a esa hora.`,
        );
      }
      antes.push({ salon: f.salon, startsAt: f.startsAt, guiaUserId: f.guiaUserId });
      movidas.push({ classroomId: f.classroomId, desde: new Date(f.startsAt), hasta: startsAt });
      await execute(
        `UPDATE scheduling_session
            SET tipo = $2::scheduling_slot_tipo, fecha = $3::date, starts_at = $4,
                duracion_min = $5, guia_user_id = $6, nivel = $7, observaciones = $8,
                limite_usuarios = $9
          WHERE id = $1`,
        [
          f.id,
          input.tipo,
          operationalDate(startsAt, f.timezone),
          startsAt,
          input.duracionMin,
          input.guiaUserId,
          input.nivel ?? null,
          input.observaciones?.trim() === "" ? null : (input.observaciones ?? null),
          input.limiteUsuarios ?? f.cupo,
        ],
        tx,
      );
      // El link del Club: el que se eligió, o ninguno si deja de ser Club.
      if (input.linkClubId !== undefined || input.tipo !== "CLUB") {
        await execute(
          `UPDATE scheduling_session SET link_club_id = $2 WHERE id = $1`,
          [f.id, input.tipo === "CLUB" ? (input.linkClubId ?? null) : null],
          tx,
        );
      }
      if (input.apertura !== undefined) {
        const a = input.apertura;
        await execute(
          `UPDATE scheduling_session
              SET abierto = $2, alcance_campaign_id = $3, alcance_curso = $4,
                  alcance_classroom_id = $5, alcance_pais = $6
            WHERE id = $1`,
          [
            f.id,
            a.abierto,
            a.abierto ? a.campaignId : null,
            a.abierto ? a.curso : null,
            a.abierto ? a.classroomId : null,
            a.abierto ? a.pais : null,
          ],
          tx,
        );
      }
      editadas++;
    }
    // Los niños agendados de otros salones van atados a (salón, instante): si el
    // evento cambia de hora, se mudan con él. En UNA sentencia, para que en una
    // serie corrida una semana el agendado no salte de semana en semana.
    if (movidas.some((x) => x.desde.getTime() !== x.hasta.getTime())) {
      await execute(
        `UPDATE scheduling_agendado g SET starts_at = m.hasta
           FROM unnest($1::uuid[], $2::timestamptz[], $3::timestamptz[]) AS m(classroom_id, desde, hasta)
          WHERE g.classroom_id = m.classroom_id AND g.starts_at = m.desde AND g.estado = 'ACTIVA'`,
        [
          movidas.map((x) => x.classroomId),
          movidas.map((x) => x.desde),
          movidas.map((x) => x.hasta),
        ],
        tx,
      );
    }
    // La tanda corre con sus semanas.
    if (enTanda && dias !== 0) {
      await execute(
        `UPDATE scheduling_tanda_club SET inicio = inicio + $2::int, fin = fin + $2::int WHERE id = $1`,
        [sesion.tandaId, dias],
        tx,
      );
    }
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.evento_editado",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: {
      antes,
      despues: {
        tipo: input.tipo,
        fecha: input.fecha,
        hora: input.horaLocal,
        duracionMin: input.duracionMin,
        guiaUserId: input.guiaUserId,
        ...(input.linkClubId !== undefined && { linkClubId: input.linkClubId }),
      },
      sesiones: editadas,
      ...(enTanda && { tandaId: sesion.tandaId, todaLaTanda: true }),
    },
    ip: input.ip ?? null,
  });
  return { sesiones: editadas };
}

// ============================================================
// Evento ADMINISTRATIVO: la audiencia son GUÍAS, no niños
// ============================================================

export interface EventoAdminCreado {
  id: string;
  guias: number;
}

/**
 * Crea un evento interno y define quién lo ve.
 *
 * Vive en su propia tabla (`scheduling_evento_admin`), no en las sesiones: un
 * evento interno no tiene matriculados, ni asistencia, ni progresión. Meterlo
 * entre las sesiones lo haría aparecer en la agenda de los alumnos y en el
 * conteo de horas del guía.
 *
 * La audiencia NO puede quedar vacía: un evento que no ve nadie es un evento
 * perdido, así que se rechaza en vez de crearlo en silencio.
 */
export async function crearEventoAdmin(input: {
  actorUserId: string;
  /** Meeting | Training | Observation | Development: vocabulario propio del
   *  evento interno, distinto del de una sesión de clase. */
  tipo: TipoEventoAdmin;
  titulo?: string | null;
  fecha: string;
  horaLocal: string;
  duracionMin: number;
  /**
   * Zona IANA del reloj con que se escribió la hora — la del navegador de
   * quien crea el evento. El evento es un INSTANTE: quien lo mire lo verá en
   * su propia hora local. Una reunión creada a las 13:00 en Colombia la ve a
   * las 15:00 quien entra desde Chile.
   */
  zona: string;
  /** Contexto de audiencia, NO el reloj. Vacío = todos los países. */
  pais?: string | null;
  campania?: string | null;
  curso?: string | null;
  classroomId?: string | null;
  nivel?: string | null;
  limiteUsuarios?: number | null;
  observaciones?: string | null;
  /** Guías que lo verán en su calendario. */
  guiaUserIds: string[];
  ip?: string | null;
}): Promise<EventoAdminCreado> {
  const { startsAt, guias } = validarEventoAdmin(input);
  const timezone = input.zona;

  const id = newId();
  await withTransaction(async (tx) => {
    await execute(
      `INSERT INTO scheduling_evento_admin
         (id, tipo, titulo, fecha, starts_at, timezone, duracion_min, campania, pais,
          curso, classroom_id, nivel, limite_usuarios, observaciones, creado_por)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        input.tipo,
        input.titulo?.trim() === "" ? null : (input.titulo ?? null),
        input.fecha,
        startsAt,
        timezone,
        input.duracionMin,
        input.campania ?? null,
        input.pais ?? null,
        input.curso ?? null,
        input.classroomId ?? null,
        input.nivel ?? null,
        input.limiteUsuarios ?? null,
        input.observaciones?.trim() === "" ? null : (input.observaciones ?? null),
        input.actorUserId,
      ],
      tx,
    );
    for (const guiaUserId of guias) {
      await execute(
        `INSERT INTO scheduling_evento_admin_guia (evento_id, guia_user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, guiaUserId],
        tx,
      );
    }
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.evento_admin_creado",
    entidad: "scheduling_evento_admin",
    entidadId: id,
    payload: { tipo: input.tipo, fecha: input.fecha, hora: input.horaLocal, guias: guias.length },
    ip: input.ip ?? null,
  });

  return { id, guias: guias.length };
}

/** Lo que define un evento administrativo: lo mismo al crearlo y al editarlo. */
export type DatosEventoAdmin = Parameters<typeof crearEventoAdmin>[0];

/** La MISMA validación al crear y al editar; devuelve el instante y la audiencia. */
function validarEventoAdmin(input: DatosEventoAdmin): { startsAt: Date; guias: string[] } {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.fecha)) {
    throw new ValidationError("La fecha debe ser YYYY-MM-DD.");
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.horaLocal)) {
    throw new ValidationError("La hora debe ser HH:MM.");
  }
  if (!esTipoEventoAdmin(input.tipo)) {
    throw new ValidationError(
      "Tipo inválido: un evento administrativo es Meeting, Training, Observation o Development.",
    );
  }
  // Una clase dura minutos; una capacitación puede ocupar la jornada.
  if (input.duracionMin < DURACION_ADMIN_MIN || input.duracionMin > DURACION_ADMIN_MAX) {
    throw new ValidationError("La duración debe estar entre 1 y 8 horas.");
  }
  const guias = [...new Set(input.guiaUserIds)];
  if (guias.length === 0) {
    throw new ValidationError("Elige al menos un guía: si no, nadie vería el evento.");
  }

  // La zona la manda el cliente; si no es una IANA válida, Intl lanza y el
  // evento quedaría en un instante arbitrario. Mejor rechazarlo.
  const timezone = input.zona;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new ValidationError(`Zona horaria desconocida: ${timezone}.`);
  }

  const [hh, mm] = input.horaLocal.split(":");
  const [y, m, d] = input.fecha.split("-");
  const startsAt = wallTimeToUtc(
    { year: Number(y), month: Number(m), day: Number(d), hour: Number(hh), minute: Number(mm) },
    timezone,
  );
  return { startsAt, guias };
}

/**
 * EDITA un evento administrativo, aunque ya tenga guías en su audiencia. La
 * audiencia nueva REEMPLAZA a la anterior: los que siguen conservan su marca de
 * asistencia; los que salen dejan de verlo.
 */
/**
 * CANCELA un evento creado a mano (sesión extra, club, taller, refuerzo): lo
 * borra del calendario en todos sus salones si es compartido y, en un Club de
 * TANDA con `todaLaTanda`, también las semanas que siguen. Las sesiones del
 * HORARIO no: esas se suspenden (corren al final del curso). Se rechaza si
 * alguna ya se registró, tiene asistencia o tiene una repetición pedida —ahí ya
 * hay historia que se perdería—. Los niños agendados quedan CANCELADOS (no se
 * borran: queda quién y cuándo), y al cancelar la tanda entera también sus
 * inscripciones.
 */
export async function eliminarEvento(input: {
  actorUserId: string;
  sessionId: string;
  todaLaTanda?: boolean;
  ip?: string | null;
}): Promise<{ sesiones: number }> {
  const sesion = await queryOne<{
    slotId: string | null;
    grupoId: string | null;
    tandaId: string | null;
    startsAt: Date;
  }>(
    `SELECT slot_id AS "slotId", grupo_id AS "grupoId", tanda_id AS "tandaId",
            starts_at AS "startsAt"
       FROM scheduling_session WHERE id = $1`,
    [input.sessionId],
  );
  if (sesion === null) throw new NotFoundError("El evento no existe.");
  if (sesion.slotId !== null) {
    throw new ValidationError(
      "Es una clase del horario del salón: no se cancela, se suspende ese día.",
    );
  }
  const enTanda = input.todaLaTanda === true && sesion.tandaId !== null;

  const borradas = await withTransaction(async (tx) => {
    const filas = await queryRows<{
      id: string;
      classroomId: string;
      startsAt: Date;
      historia: boolean;
    }>(
      `SELECT s.id, s.classroom_id AS "classroomId", s.starts_at AS "startsAt",
              (s.cerrada_en IS NOT NULL
               OR EXISTS (SELECT 1 FROM attendance_attendance a WHERE a.session_id = s.id)
               OR EXISTS (SELECT 1 FROM scheduling_repeticion r WHERE r.session_id = s.id))
                AS historia
         FROM scheduling_session s
        WHERE s.id = $1
           OR ($2::uuid IS NOT NULL AND s.grupo_id = $2)
           OR ($3::uuid IS NOT NULL AND s.tanda_id = $3 AND s.starts_at >= $4)
        FOR UPDATE`,
      [input.sessionId, sesion.grupoId, enTanda ? sesion.tandaId : null, sesion.startsAt],
      tx,
    );
    if (filas.some((f) => f.historia)) {
      throw new ConflictError(
        enTanda
          ? "Alguna sesión de la tanda ya se registró o tiene asistencia: cancela solo las que faltan, una por una."
          : "El evento ya se registró o tiene asistencia: no se puede cancelar.",
      );
    }
    for (const f of filas) {
      await execute(
        `UPDATE scheduling_agendado
            SET estado = 'CANCELADA', cancelado_por = $3, cancelado_en = now()
          WHERE classroom_id = $1 AND starts_at = $2 AND estado = 'ACTIVA'`,
        [f.classroomId, f.startsAt, input.actorUserId],
        tx,
      );
    }
    if (enTanda) {
      await execute(
        `UPDATE scheduling_club_inscripcion
            SET estado = 'CANCELADA', fin_en = now(), fin_por = $2,
                fin_motivo = 'Se canceló el club'
          WHERE tanda_id = $1 AND estado = 'ACTIVA'`,
        [sesion.tandaId, input.actorUserId],
        tx,
      );
    }
    await execute(
      `DELETE FROM scheduling_session WHERE id = ANY($1)`,
      [filas.map((f) => f.id)],
      tx,
    );
    return filas.length;
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.evento_cancelado",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: { sesiones: borradas, todaLaTanda: enTanda, tandaId: sesion.tandaId },
    ip: input.ip ?? null,
  });
  return { sesiones: borradas };
}

/**
 * SUSPENDE (o reactiva) un evento creado a mano, en todos sus salones si es
 * compartido. NO lo borra: queda en el calendario marcado, con quién, cuándo y
 * por qué; mientras esté suspendido no se pasa lista ni se registra y no cuenta
 * como dictado (`SQL_SESION_CANCELADA`). Los inscritos siguen inscritos —en un
 * Club, esa semana no les cuenta como falta: no hay marca—. Una clase del
 * HORARIO no: esa se suspende corriéndola al final del curso.
 */
export async function suspenderEvento(input: {
  actorUserId: string;
  sessionId: string;
  /** null = reactivar. */
  motivo: string | null;
  ip?: string | null;
}): Promise<{ sesiones: number }> {
  const motivo = input.motivo?.trim() ?? null;
  if (motivo !== null && motivo === "") {
    throw new ValidationError("El motivo de la suspensión es obligatorio.");
  }
  const sesion = await queryOne<{ slotId: string | null; grupoId: string | null }>(
    `SELECT slot_id AS "slotId", grupo_id AS "grupoId" FROM scheduling_session WHERE id = $1`,
    [input.sessionId],
  );
  if (sesion === null) throw new NotFoundError("El evento no existe.");
  if (sesion.slotId !== null) {
    throw new ValidationError(
      "Es una clase del horario del salón: se suspende el día y corre al final del curso.",
    );
  }
  const n = await withTransaction(async (tx) => {
    const filas = await queryRows<{ id: string; historia: boolean }>(
      `SELECT s.id,
              (s.cerrada_en IS NOT NULL
               OR EXISTS (SELECT 1 FROM attendance_attendance a WHERE a.session_id = s.id))
                AS historia
         FROM scheduling_session s
        WHERE s.id = $1 OR ($2::uuid IS NOT NULL AND s.grupo_id = $2)
        FOR UPDATE`,
      [input.sessionId, sesion.grupoId],
      tx,
    );
    if (motivo !== null && filas.some((f) => f.historia)) {
      throw new ConflictError("El evento ya se registró o tiene asistencia: no se suspende.");
    }
    return execute(
      motivo === null
        ? `UPDATE scheduling_session
              SET suspendida_en = NULL, suspendida_por = NULL, suspension_motivo = NULL
            WHERE id = ANY($1) AND suspendida_en IS NOT NULL`
        : `UPDATE scheduling_session
              SET suspendida_en = now(), suspendida_por = $2, suspension_motivo = $3
            WHERE id = ANY($1) AND suspendida_en IS NULL`,
      motivo === null
        ? [filas.map((f) => f.id)]
        : [filas.map((f) => f.id), input.actorUserId, motivo],
      tx,
    );
  });
  if (n === 0) {
    throw new ConflictError(
      motivo === null ? "El evento no está suspendido." : "El evento ya estaba suspendido.",
    );
  }
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: motivo === null ? "scheduling.evento_reactivado" : "scheduling.evento_suspendido",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: { sesiones: n, motivo },
    ip: input.ip ?? null,
  });
  return { sesiones: n };
}

export async function editarEventoAdmin(
  input: DatosEventoAdmin & { id: string },
): Promise<{ id: string; guias: number }> {
  const antes = await detalleEventoAdmin(input.id);
  const { startsAt, guias } = validarEventoAdmin(input);
  await withTransaction(async (tx) => {
    await execute(
      `UPDATE scheduling_evento_admin
          SET tipo = $2, titulo = $3, fecha = $4::date, starts_at = $5, timezone = $6,
              duracion_min = $7, campania = $8, pais = $9, curso = $10, classroom_id = $11,
              nivel = $12, limite_usuarios = $13, observaciones = $14
        WHERE id = $1`,
      [
        input.id,
        input.tipo,
        input.titulo?.trim() === "" ? null : (input.titulo ?? null),
        input.fecha,
        startsAt,
        input.zona,
        input.duracionMin,
        input.campania ?? null,
        input.pais ?? null,
        input.curso ?? null,
        input.classroomId ?? null,
        input.nivel ?? null,
        input.limiteUsuarios ?? null,
        input.observaciones?.trim() === "" ? null : (input.observaciones ?? null),
      ],
      tx,
    );
    await execute(
      `DELETE FROM scheduling_evento_admin_guia
        WHERE evento_id = $1 AND NOT (guia_user_id = ANY($2::uuid[]))`,
      [input.id, guias],
      tx,
    );
    for (const guiaUserId of guias) {
      await execute(
        `INSERT INTO scheduling_evento_admin_guia (evento_id, guia_user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [input.id, guiaUserId],
        tx,
      );
    }
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.evento_admin_editado",
    entidad: "scheduling_evento_admin",
    entidadId: input.id,
    payload: {
      antes: {
        tipo: antes.tipo,
        startsAt: antes.startsAt,
        duracionMin: antes.duracionMin,
        guias: antes.guiaUserIds.length,
      },
      despues: {
        tipo: input.tipo,
        fecha: input.fecha,
        hora: input.horaLocal,
        zona: input.zona,
        duracionMin: input.duracionMin,
        guias: guias.length,
      },
    },
    ip: input.ip ?? null,
  });
  return { id: input.id, guias: guias.length };
}

export interface DetalleEventoAdmin {
  id: string;
  tipo: string;
  titulo: string | null;
  startsAt: string;
  duracionMin: number;
  campania: string | null;
  pais: string | null;
  curso: string | null;
  classroomId: string | null;
  nivel: string | null;
  limiteUsuarios: number | null;
  observaciones: string | null;
  guiaUserIds: string[];
}

/** El evento administrativo completo, para editarlo. */
export async function detalleEventoAdmin(id: string): Promise<DetalleEventoAdmin> {
  const e = await queryOne<DetalleEventoAdmin>(
    `SELECT e.id, e.tipo, e.titulo, e.starts_at AS "startsAt", e.duracion_min AS "duracionMin",
            e.campania, e.pais::text AS pais, e.curso, e.classroom_id AS "classroomId", e.nivel,
            e.limite_usuarios AS "limiteUsuarios", e.observaciones,
            COALESCE((SELECT array_agg(g.guia_user_id) FROM scheduling_evento_admin_guia g
                       WHERE g.evento_id = e.id), ARRAY[]::uuid[]) AS "guiaUserIds"
       FROM scheduling_evento_admin e WHERE e.id = $1`,
    [id],
  );
  if (e === null) throw new NotFoundError("El evento no existe.");
  return e;
}

export interface EventoAdmin {
  id: string;
  tipo: string;
  titulo: string | null;
  fecha: string;
  startsAt: string;
  duracionMin: number;
  campania: string | null;
  curso: string | null;
  nivel: string | null;
  observaciones: string | null;
  pais: string | null;
  /** Cuántos guías lo ven. */
  guias: number;
  /** Cuántos asistieron y cuántos ya tienen marca (para distinguir 0 de "sin pasar lista"). */
  asistieron: number;
  marcados: number;
  /** Quiénes lo ven, para poder gestionarlo sin abrir el evento. */
  audiencia: string[];
}

/**
 * Eventos administrativos de un rango.
 *
 * Con `guiaUserId` devuelve SOLO los que ese guía debe ver; con null, todos
 * (vista de administración).
 */
export async function eventosAdmin(
  desde: string,
  hasta: string,
  guiaUserId: string | null,
  filtros: { tipo?: string | null; pais?: string | null } = {},
): Promise<EventoAdmin[]> {
  const values: unknown[] = [desde, hasta];
  const cond: string[] = [];
  if (guiaUserId !== null) {
    values.push(guiaUserId);
    cond.push(`EXISTS (SELECT 1 FROM scheduling_evento_admin_guia g
                          WHERE g.evento_id = e.id AND g.guia_user_id = $${String(values.length)})`);
  }
  if (filtros.tipo != null && filtros.tipo !== "") {
    values.push(filtros.tipo);
    cond.push(`e.tipo = $${String(values.length)}`);
  }
  if (filtros.pais != null && filtros.pais !== "") {
    values.push(filtros.pais);
    cond.push(`e.pais = $${String(values.length)}`);
  }
  const filtro = cond.length > 0 ? `AND ${cond.join(" AND ")}` : "";
  return queryRows<EventoAdmin>(
    `SELECT e.id, e.tipo, e.titulo, e.fecha::text AS fecha, e.starts_at AS "startsAt",
            e.duracion_min AS "duracionMin", e.campania, e.curso, e.nivel, e.observaciones,
            e.pais,
            (SELECT count(*) FROM scheduling_evento_admin_guia g WHERE g.evento_id = e.id)::int AS guias,
            (SELECT count(*) FROM scheduling_evento_admin_guia g
              WHERE g.evento_id = e.id AND g.asistio)::int AS asistieron,
            (SELECT count(*) FROM scheduling_evento_admin_guia g
              WHERE g.evento_id = e.id AND g.asistio IS NOT NULL)::int AS marcados,
            COALESCE((SELECT array_agg(u.username ORDER BY u.username)
                        FROM scheduling_evento_admin_guia g
                        JOIN identity_user u ON u.id = g.guia_user_id
                       WHERE g.evento_id = e.id), ARRAY[]::text[]) AS audiencia
       FROM scheduling_evento_admin e
      WHERE e.fecha BETWEEN $1::date AND $2::date
        ${filtro}
      ORDER BY e.starts_at`,
    values,
  );
}

// ============================================================
// Asistencia del evento administrativo
// ============================================================

export interface AsistenteEventoAdmin {
  guiaUserId: string;
  username: string;
  nombre: string | null;
  /** null = todavía nadie pasó lista. Distinto de "no vino". */
  asistio: boolean | null;
  marcadoEn: string | null;
}

/** La audiencia del evento, con su marca. Es la lista del modal. */
export async function audienciaEventoAdmin(eventoId: string): Promise<AsistenteEventoAdmin[]> {
  return queryRows<AsistenteEventoAdmin>(
    `SELECT g.guia_user_id AS "guiaUserId", u.username,
            NULLIF(TRIM(CONCAT_WS(' ', gu.nombres, gu.apellidos)), '') AS nombre,
            g.asistio, g.marcado_en::text AS "marcadoEn"
       FROM scheduling_evento_admin_guia g
       JOIN identity_user u ON u.id = g.guia_user_id
       LEFT JOIN scheduling_guia gu ON gu.guia_user_id = g.guia_user_id
      WHERE g.evento_id = $1
      ORDER BY u.username`,
    [eventoId],
  );
}

/**
 * Pasa lista del evento administrativo.
 *
 * Se guarda en la tabla de AUDIENCIA, nunca en `attendance_attendance`: esa
 * es la asistencia de NIÑOS a sesiones y dispara la función central de
 * progresión (regla 4). Un guía en una capacitación no tiene progresión que
 * mover, y mezclarlas metería un segundo camino de escritura donde debe
 * haber uno solo.
 *
 * Solo se tocan los guías que vienen en `marcas`, y solo si están en la
 * audiencia: marcar a alguien que no fue convocado sería inventar un dato.
 */
export async function marcarAsistenciaEventoAdmin(input: {
  actorUserId: string;
  eventoId: string;
  marcas: { guiaUserId: string; asistio: boolean | null }[];
  ip?: string | null;
}): Promise<{ marcados: number }> {
  const evento = await queryOne<{ id: string }>(
    `SELECT id FROM scheduling_evento_admin WHERE id = $1`,
    [input.eventoId],
  );
  if (evento === null) throw new NotFoundError("El evento no existe.");

  let marcados = 0;
  await withTransaction(async (tx) => {
    for (const m of input.marcas) {
      marcados += await execute(
        `UPDATE scheduling_evento_admin_guia
            SET asistio = $3::boolean,
                marcado_en = CASE WHEN $3::boolean IS NULL THEN NULL ELSE now() END,
                marcado_por = CASE WHEN $3::boolean IS NULL THEN NULL ELSE $4::uuid END
          WHERE evento_id = $1 AND guia_user_id = $2`,
        [input.eventoId, m.guiaUserId, m.asistio, input.actorUserId],
        tx,
      );
    }
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.evento_admin_asistencia",
    entidad: "scheduling_evento_admin",
    entidadId: input.eventoId,
    payload: { marcados },
    ip: input.ip ?? null,
  });
  return { marcados };
}
