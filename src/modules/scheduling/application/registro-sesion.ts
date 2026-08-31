import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { withTransaction } from "@/platform/db/transaction";

/**
 * Registro de sesión y solicitud de repetición.
 *
 * Reparto de poder (lo pidió el negocio):
 *  - El GUÍA cierra la sesión que dictó y puede SOLICITAR repetirla.
 *  - Suspender y aprobar la repetición son del coordinador (`salones.gestionar`).
 *
 * Cerrar deja constancia en el evento del calendario y alimenta el conteo
 * mensual por guía.
 */

export interface RegistroSesion {
  sessionId: string;
  guiaUserId: string | null;
  cerradaPor: string | null;
  cerradaEn: string | null;
  /** Hora de pared reportada por el guía, en la zona del salón. */
  horaReal: string | null;
  notaSesion: string | null;
  sinAsistentes: boolean;
}

/**
 * El guía marca la sesión como dictada.
 *
 * Además fija `guia_user_id` si estaba vacío: el salón puede cambiar de guía
 * más adelante y el histórico debe recordar quién la dictó de verdad.
 */
export async function cerrarSesion(input: {
  actorUserId: string;
  sessionId: string;
  /** Hora a la que se dictó (HH:MM), en la zona del salón. */
  horaReal: string;
  nota?: string | null;
  /** El guía confirmó que NO asistió nadie. Obligatorio si no hay marcas. */
  sinAsistentes?: boolean;
  ip?: string | null;
}): Promise<RegistroSesion> {
  const sesion = await queryOne<{
    id: string;
    classroom_id: string;
    salon: string;
    fecha: string;
    starts_at: string;
    cerrada_en: string | null;
    guia_salon: string | null;
  }>(
    `SELECT s.id, s.classroom_id, cl.nombre AS salon, s.fecha::text AS fecha,
            s.starts_at::text AS starts_at, s.cerrada_en::text AS cerrada_en,
            cl.guia_user_id AS guia_salon
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE s.id = $1`,
    [input.sessionId],
  );
  if (sesion === null) throw new NotFoundError("La sesión no existe.");
  if (sesion.cerrada_en !== null) {
    throw new ConflictError("Esta sesión ya fue cerrada.");
  }
  if (new Date(sesion.starts_at).getTime() > Date.now()) {
    throw new ValidationError("No se puede cerrar una sesión que todavía no empieza.");
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.horaReal)) {
    throw new ValidationError("La hora debe ser HH:MM.");
  }

  // Cerrar sin ninguna marca es válido —puede que no llegara nadie— pero exige
  // decirlo a propósito: en los reportes no es lo mismo que olvidar marcar.
  const marcas = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM attendance_attendance WHERE session_id = $1`,
    [input.sessionId],
  );
  const hayMarcas = marcas !== null && Number(marcas.n) > 0;
  if (!hayMarcas && input.sinAsistentes !== true) {
    throw new ValidationError(
      "No hay ninguna asistencia marcada. Confirma que no asistió nadie para poder registrar la sesión.",
    );
  }

  await execute(
    `UPDATE scheduling_session
        SET cerrada_por = $2,
            cerrada_en = now(),
            guia_user_id = COALESCE(guia_user_id, $3),
            hora_real = $4::time,
            nota_sesion = $5,
            sin_asistentes = $6
      WHERE id = $1`,
    [
      input.sessionId,
      input.actorUserId,
      sesion.guia_salon ?? input.actorUserId,
      input.horaReal,
      input.nota?.trim() === "" ? null : (input.nota ?? null),
      !hayMarcas,
    ],
  );

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.sesion_cerrada",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: {
      salon: sesion.salon,
      fecha: sesion.fecha,
      horaReal: input.horaReal,
      sinAsistentes: !hayMarcas,
    },
    ip: input.ip ?? null,
  });

  return leerRegistro(input.sessionId);
}

/** Reabre una sesión cerrada. Solo coordinación (lo exige el endpoint). */
export async function reabrirSesion(input: {
  actorUserId: string;
  sessionId: string;
  ip?: string | null;
}): Promise<RegistroSesion> {
  await execute(
    `UPDATE scheduling_session
        SET cerrada_por = NULL, cerrada_en = NULL,
            hora_real = NULL, nota_sesion = NULL, sin_asistentes = FALSE
      WHERE id = $1`,
    [input.sessionId],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.sesion_reabierta",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: {},
    ip: input.ip ?? null,
  });
  return leerRegistro(input.sessionId);
}

async function leerRegistro(sessionId: string): Promise<RegistroSesion> {
  const fila = await queryOne<RegistroSesion>(
    `SELECT id AS "sessionId", guia_user_id AS "guiaUserId",
            cerrada_por AS "cerradaPor", cerrada_en::text AS "cerradaEn",
            to_char(hora_real, 'HH24:MI') AS "horaReal",
            nota_sesion AS "notaSesion", sin_asistentes AS "sinAsistentes"
       FROM scheduling_session WHERE id = $1`,
    [sessionId],
  );
  if (fila === null) throw new NotFoundError("La sesión no existe.");
  return fila;
}

export interface Repeticion {
  id: string;
  sessionId: string;
  solicitadoPor: string;
  solicitante: string | null;
  motivo: string;
  repetirLeccion: boolean;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  resueltoPor: string | null;
  resueltoEn: string | null;
  notaResolucion: string | null;
  createdAt: string;
}

/** El guía pide repetir la sesión (y opcionalmente la lección). */
export async function solicitarRepeticion(input: {
  actorUserId: string;
  sessionId: string;
  motivo: string;
  repetirLeccion: boolean;
  ip?: string | null;
}): Promise<{ id: string }> {
  const motivo = input.motivo.trim();
  if (motivo.length < 5) {
    throw new ValidationError("Explica el motivo de la repetición (mínimo 5 caracteres).");
  }
  const sesion = await queryOne<{ id: string }>(`SELECT id FROM scheduling_session WHERE id = $1`, [
    input.sessionId,
  ]);
  if (sesion === null) throw new NotFoundError("La sesión no existe.");

  const viva = await queryOne<{ id: string }>(
    `SELECT id FROM scheduling_repeticion WHERE session_id = $1 AND estado = 'PENDIENTE'`,
    [input.sessionId],
  );
  if (viva !== null) {
    throw new ConflictError("Ya hay una solicitud pendiente para esta sesión.");
  }

  const id = newId();
  await execute(
    `INSERT INTO scheduling_repeticion (id, session_id, solicitado_por, motivo, repetir_leccion)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.sessionId, input.actorUserId, motivo, input.repetirLeccion],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.repeticion_solicitada",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: { motivo, repetirLeccion: input.repetirLeccion },
    ip: input.ip ?? null,
  });
  return { id };
}

/** Coordinación aprueba o rechaza. La decisión queda en el evento. */
export async function resolverRepeticion(input: {
  actorUserId: string;
  repeticionId: string;
  aprobar: boolean;
  nota?: string | null;
  ip?: string | null;
}): Promise<void> {
  await withTransaction(async (tx) => {
    const fila = await queryOne<{ session_id: string; estado: string }>(
      `SELECT session_id, estado FROM scheduling_repeticion WHERE id = $1 FOR UPDATE`,
      [input.repeticionId],
      tx,
    );
    if (fila === null) throw new NotFoundError("La solicitud no existe.");
    if (fila.estado !== "PENDIENTE") {
      throw new ConflictError("Esa solicitud ya fue resuelta.");
    }
    await execute(
      `UPDATE scheduling_repeticion
          SET estado = $2, resuelto_por = $3, resuelto_en = now(), nota_resolucion = $4
        WHERE id = $1`,
      [
        input.repeticionId,
        input.aprobar ? "APROBADA" : "RECHAZADA",
        input.actorUserId,
        input.nota ?? null,
      ],
      tx,
    );
    await registrarAuditoria({
      actorUserId: input.actorUserId,
      accion: input.aprobar ? "scheduling.repeticion_aprobada" : "scheduling.repeticion_rechazada",
      entidad: "scheduling_session",
      entidadId: fila.session_id,
      payload: { repeticionId: input.repeticionId, nota: input.nota ?? null },
      ip: input.ip ?? null,
    });
  });
}

/** Solicitudes de una sesión, para pintarlas en el evento del calendario. */
export async function repeticionesDeSesion(sessionId: string): Promise<Repeticion[]> {
  return queryRows<Repeticion>(
    `SELECT r.id, r.session_id AS "sessionId", r.solicitado_por AS "solicitadoPor",
            u.username AS solicitante, r.motivo, r.repetir_leccion AS "repetirLeccion",
            r.estado, r.resuelto_por AS "resueltoPor", r.resuelto_en::text AS "resueltoEn",
            r.nota_resolucion AS "notaResolucion", r.created_at::text AS "createdAt"
       FROM scheduling_repeticion r
       LEFT JOIN identity_user u ON u.id = r.solicitado_por
      WHERE r.session_id = $1
      ORDER BY r.created_at DESC`,
    [sessionId],
  );
}

/** Bandeja del coordinador. */
export async function repeticionesPendientes(limite = 50): Promise<Repeticion[]> {
  return queryRows<Repeticion>(
    `SELECT r.id, r.session_id AS "sessionId", r.solicitado_por AS "solicitadoPor",
            u.username AS solicitante, r.motivo, r.repetir_leccion AS "repetirLeccion",
            r.estado, r.resuelto_por AS "resueltoPor", r.resuelto_en::text AS "resueltoEn",
            r.nota_resolucion AS "notaResolucion", r.created_at::text AS "createdAt"
       FROM scheduling_repeticion r
       LEFT JOIN identity_user u ON u.id = r.solicitado_por
      WHERE r.estado = 'PENDIENTE'
      ORDER BY r.created_at
      LIMIT $1`,
    [limite],
  );
}
