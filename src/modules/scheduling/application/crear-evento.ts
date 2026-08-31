import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { OPERATIONAL_TIMEZONES, wallTimeToUtc } from "@/platform/time";
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

/** Máximo de salones que puede compartir un mismo evento. */
export const MAX_SALONES_COMPARTIDOS = 3;

export interface EventoCreado {
  grupoId: string | null;
  sesiones: { id: string; classroomId: string; salon: string }[];
}

export interface GuiaConZoom {
  id: string;
  username: string;
  zoomUrl: string | null;
}

/** Guías activos con su enlace de Zoom, para el selector del formulario. */
export async function guiasConZoom(): Promise<GuiaConZoom[]> {
  return queryRows<GuiaConZoom>(
    `SELECT u.id, u.username, g.zoom_url AS "zoomUrl"
       FROM identity_user u
       JOIN access_user_role ur ON ur.user_id = u.id
       JOIN access_role r ON r.id = ur.role_id
       LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
      WHERE r.code = 'guia' AND u.estado = 'ACTIVO'
      GROUP BY u.id, u.username, g.zoom_url
      ORDER BY u.username`,
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
}

/** Ficha operativa de todos los guías activos. */
export async function fichasDeGuias(): Promise<FichaGuia[]> {
  return queryRows<FichaGuia>(
    `SELECT u.id AS "guiaUserId", u.username,
            g.nombres, g.apellidos, g.doc_numero AS "docNumero", g.email, g.telefono,
            g.pais, g.domicilio, g.fecha_nacimiento::text AS "fechaNacimiento",
            g.zoom_url AS "zoomUrl", g.foto_file_id AS "fotoFileId"
       FROM identity_user u
       JOIN access_user_role ur ON ur.user_id = u.id
       JOIN access_role r ON r.id = ur.role_id
       LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
      WHERE r.code = 'guia' AND u.estado = 'ACTIVO'
      GROUP BY u.id, u.username, g.nombres, g.apellidos, g.doc_numero, g.email,
               g.telefono, g.pais, g.domicilio, g.fecha_nacimiento, g.zoom_url, g.foto_file_id
      ORDER BY u.username`,
  );
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
            zoom_url = EXCLUDED.zoom_url, foto_file_id = EXCLUDED.foto_file_id,
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
  ip?: string | null;
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
  const salones = [...new Set(input.classroomIds)];
  if (salones.length === 0) {
    throw new ValidationError("Elige al menos un salón.");
  }
  if (salones.length > MAX_SALONES_COMPARTIDOS) {
    throw new ValidationError(
      `Un evento compartido admite hasta ${String(MAX_SALONES_COMPARTIDOS)} salones.`,
    );
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
  // grupo para que el conteo del guía no la cuente varias veces.
  const grupoId = salones.length > 1 ? newId() : null;
  const creadas: EventoCreado["sesiones"] = [];

  await withTransaction(async (tx) => {
    for (const classroomId of salones) {
      const salon = await queryOne<{ id: string; nombre: string; timezone: string; cupo: number }>(
        `SELECT id, nombre, timezone, cupo FROM scheduling_classroom WHERE id = $1 AND activo`,
        [classroomId],
        tx,
      );
      if (salon === null) {
        throw new NotFoundError("Un salón no existe o está desactivado.");
      }

      // La hora es de PARED en la zona del salón (ADR-0007); el instante se
      // calcula por salón, porque dos salones pueden estar en zonas distintas.
      const [hh, mm] = input.horaLocal.split(":");
      const [y, m, d] = input.fecha.split("-");
      const startsAt = wallTimeToUtc(
        {
          year: Number(y),
          month: Number(m),
          day: Number(d),
          hour: Number(hh),
          minute: Number(mm),
        },
        salon.timezone,
      );

      const choque = await queryOne<{ id: string }>(
        `SELECT id FROM scheduling_session WHERE classroom_id = $1 AND starts_at = $2`,
        [classroomId, startsAt],
        tx,
      );
      if (choque !== null) {
        throw new ConflictError(`${salon.nombre} ya tiene un evento a esa hora.`);
      }

      const id = newId();
      await execute(
        `INSERT INTO scheduling_session
           (id, classroom_id, slot_id, tipo, fecha, starts_at, duracion_min, numero,
            guia_user_id, nivel, observaciones, limite_usuarios, grupo_id)
         VALUES ($1, $2, NULL, $3::scheduling_slot_tipo, $4::date, $5, $6, 0,
                 $7, $8, $9, $10, $11)`,
        [
          id,
          classroomId,
          input.tipo,
          input.fecha,
          startsAt,
          input.duracionMin,
          input.guiaUserId,
          input.nivel ?? null,
          input.observaciones?.trim() === "" ? null : (input.observaciones ?? null),
          input.limiteUsuarios ?? salon.cupo,
          grupoId,
        ],
        tx,
      );
      creadas.push({ id, classroomId, salon: salon.nombre });
    }
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.evento_creado",
    entidad: "scheduling_session",
    entidadId: creadas[0]?.id ?? null,
    payload: {
      tipo: input.tipo,
      fecha: input.fecha,
      hora: input.horaLocal,
      salones: creadas.map((c) => c.salon),
      compartido: grupoId !== null,
      conZoom: guia.zoom_url !== null && guia.zoom_url !== "",
    },
    ip: input.ip ?? null,
  });

  return { grupoId, sesiones: creadas };
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
  tipo: TipoEvento;
  titulo?: string | null;
  fecha: string;
  horaLocal: string;
  duracionMin: number;
  /** País que fija la zona horaria del evento. */
  pais: string;
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
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.fecha)) {
    throw new ValidationError("La fecha debe ser YYYY-MM-DD.");
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.horaLocal)) {
    throw new ValidationError("La hora debe ser HH:MM.");
  }
  if (input.duracionMin < 15 || input.duracionMin > 300) {
    throw new ValidationError("La duración debe estar entre 15 y 300 minutos.");
  }
  const guias = [...new Set(input.guiaUserIds)];
  if (guias.length === 0) {
    throw new ValidationError("Elige al menos un guía: si no, nadie vería el evento.");
  }

  const timezone = OPERATIONAL_TIMEZONES[input.pais as keyof typeof OPERATIONAL_TIMEZONES] ?? null;
  if (timezone === null) {
    throw new ValidationError(`País sin zona horaria conocida: ${input.pais}.`);
  }

  const [hh, mm] = input.horaLocal.split(":");
  const [y, m, d] = input.fecha.split("-");
  const startsAt = wallTimeToUtc(
    { year: Number(y), month: Number(m), day: Number(d), hour: Number(hh), minute: Number(mm) },
    timezone,
  );

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
        input.pais,
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
  guias: number;
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
): Promise<EventoAdmin[]> {
  const values: unknown[] = [desde, hasta];
  let filtro = "";
  if (guiaUserId !== null) {
    values.push(guiaUserId);
    filtro = `AND EXISTS (SELECT 1 FROM scheduling_evento_admin_guia g
                            WHERE g.evento_id = e.id AND g.guia_user_id = $${String(values.length)})`;
  }
  return queryRows<EventoAdmin>(
    `SELECT e.id, e.tipo, e.titulo, e.fecha::text AS fecha, e.starts_at AS "startsAt",
            e.duracion_min AS "duracionMin", e.campania, e.curso, e.nivel, e.observaciones,
            (SELECT count(*) FROM scheduling_evento_admin_guia g WHERE g.evento_id = e.id)::int AS guias
       FROM scheduling_evento_admin e
      WHERE e.fecha BETWEEN $1::date AND $2::date
        ${filtro}
      ORDER BY e.starts_at`,
    values,
  );
}
