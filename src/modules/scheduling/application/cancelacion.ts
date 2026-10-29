import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";

/**
 * CANCELACIÓN DE SESIÓN POR EL GUÍA (2026-10-14), como lo definió el negocio:
 *  - el guía AVISA que no puede dictarla (con motivo);
 *  - quien la CANCELA es administración (`salones.gestionar`), y entonces cuenta
 *    en el control de horas de ESE guía (`sesionesCanceladas` del mes);
 *  - administración puede cubrirla con OTRO guía: el reemplazo es solo de esa
 *    sesión —escribe `scheduling_session.guia_user_id`, igual que "Cambiar guía"
 *    del modal— y no toca las sesiones futuras. Sin reemplazo, la sesión queda
 *    CANCELADA: no se registra ni se pasa lista.
 *
 * Distinto de la SUSPENSIÓN (`suspenderDia`), que es decisión de administración
 * y corre la sesión al final del curso regenerando el salón.
 */

export type EstadoCancelacion = "PENDIENTE" | "APROBADA" | "RECHAZADA";

export interface Cancelacion {
  id: string;
  sessionId: string | null;
  classroomId: string;
  fecha: string;
  startsAt: string;
  guiaUserId: string;
  guia: string;
  motivo: string;
  estado: EstadoCancelacion;
  solicitadaPor: string;
  solicitante: string;
  createdAt: string;
  resueltaPor: string | null;
  resueltaEn: string | null;
  notaResolucion: string | null;
  reemplazoGuiaUserId: string | null;
  reemplazo: string | null;
}

/** Nombre de una cuenta: su ficha de guía, la de staff, la de persona o el usuario. */
const nombreDe = (alias: string) => `(SELECT COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', g.nombres, g.apellidos)), ''),
      NULLIF(TRIM(CONCAT_WS(' ', pf.nombres, pf.apellidos)), ''),
      NULLIF(TRIM(CONCAT_WS(' ', pp.nombres, pp.apellidos)), ''),
      u.username)
   FROM identity_user u
   LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
   LEFT JOIN identity_perfil pf ON pf.user_id = u.id
   LEFT JOIN people_person pp ON pp.user_id = u.id
  WHERE u.id = ${alias})`;

const COLUMNAS_CANCELACION = `
         c.id, c.session_id AS "sessionId", c.classroom_id AS "classroomId",
         c.fecha::text AS fecha, c.starts_at AS "startsAt",
         c.guia_user_id AS "guiaUserId", ${nombreDe("c.guia_user_id")} AS guia,
         c.motivo, c.estado, c.solicitada_por AS "solicitadaPor",
         ${nombreDe("c.solicitada_por")} AS solicitante, c.created_at AS "createdAt",
         c.resuelta_por AS "resueltaPor", c.resuelta_en AS "resueltaEn",
         c.nota_resolucion AS "notaResolucion",
         c.reemplazo_guia_user_id AS "reemplazoGuiaUserId",
         CASE WHEN c.reemplazo_guia_user_id IS NULL THEN NULL
              ELSE ${nombreDe("c.reemplazo_guia_user_id")} END AS reemplazo`;

const SELECT_CANCELACION = `SELECT ${COLUMNAS_CANCELACION} FROM scheduling_cancelacion c`;

interface SesionParaCancelar {
  id: string;
  classroomId: string;
  fecha: string;
  startsAt: string;
  cerradaEn: string | null;
  guiaEfectivo: string | null;
}

async function sesionParaCancelar(
  sessionId: string,
  client?: PoolClient,
): Promise<SesionParaCancelar> {
  const s = await queryOne<SesionParaCancelar>(
    `SELECT s.id, s.classroom_id AS "classroomId", s.fecha::text AS fecha,
            s.starts_at AS "startsAt", s.cerrada_en AS "cerradaEn",
            COALESCE(s.guia_user_id, cl.guia_user_id) AS "guiaEfectivo"
       FROM scheduling_session s JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE s.id = $1
      FOR UPDATE OF s`,
    [sessionId],
    client,
  );
  if (s === null) throw new NotFoundError("La sesión no existe.");
  if (s.cerradaEn !== null) {
    throw new ConflictError("La sesión ya se registró como dictada: no se puede cancelar.");
  }
  if (s.guiaEfectivo === null) {
    throw new ValidationError("La sesión no tiene guía asignado: no hay a quién cancelársela.");
  }
  return s;
}

function exigirMotivo(motivo: string): string {
  const m = motivo.trim();
  if (m.length < 5) throw new ValidationError("Explica el motivo (mínimo 5 caracteres).");
  if (m.length > 500) throw new ValidationError("El motivo admite hasta 500 caracteres.");
  return m;
}

/** Aplica la decisión de administración sobre una cancelación PENDIENTE, en `tx`. */
async function resolverTx(
  tx: PoolClient,
  input: {
    actorUserId: string;
    cancelacionId: string;
    aprobar: boolean;
    reemplazoGuiaUserId: string | null;
    nota: string | null;
  },
): Promise<{ sessionId: string | null; guiaUserId: string }> {
  const c = await queryOne<{
    sessionId: string | null;
    estado: EstadoCancelacion;
    guiaUserId: string;
  }>(
    `SELECT session_id AS "sessionId", estado, guia_user_id AS "guiaUserId"
       FROM scheduling_cancelacion WHERE id = $1 FOR UPDATE`,
    [input.cancelacionId],
    tx,
  );
  if (c === null) throw new NotFoundError("El aviso de cancelación no existe.");
  if (c.estado !== "PENDIENTE") {
    throw new ConflictError("Ese aviso ya se resolvió.");
  }
  const reemplazo = input.aprobar ? input.reemplazoGuiaUserId : null;
  if (reemplazo !== null) {
    if (reemplazo === c.guiaUserId) {
      throw new ValidationError("El reemplazo tiene que ser OTRO guía.");
    }
    const activo = await queryOne<{ id: string }>(
      `SELECT id FROM identity_user WHERE id = $1 AND estado = 'ACTIVO'`,
      [reemplazo],
      tx,
    );
    if (activo === null) throw new NotFoundError("El guía de reemplazo no existe o está inactivo.");
    if (c.sessionId === null) {
      throw new ConflictError("La sesión ya no existe: no hay qué cubrir.");
    }
    await sesionParaCancelar(c.sessionId, tx);
    // Solo ESTA sesión: las demás siguen con el guía del salón.
    await execute(
      `UPDATE scheduling_session SET guia_user_id = $2 WHERE id = $1`,
      [c.sessionId, reemplazo],
      tx,
    );
  }
  await execute(
    `UPDATE scheduling_cancelacion
        SET estado = $2, resuelta_por = $3, resuelta_en = now(), nota_resolucion = $4,
            reemplazo_guia_user_id = $5
      WHERE id = $1`,
    [
      input.cancelacionId,
      input.aprobar ? "APROBADA" : "RECHAZADA",
      input.actorUserId,
      input.nota?.trim() === "" ? null : (input.nota?.trim() ?? null),
      reemplazo,
    ],
    tx,
  );
  return { sessionId: c.sessionId, guiaUserId: c.guiaUserId };
}

/**
 * El guía AVISA que no puede dictar la sesión. Queda PENDIENTE hasta que
 * administración la resuelva. Con `salones.gestionar` se puede avisar por
 * cualquier guía (coordinación recibe el aviso por teléfono); sin él, solo
 * de las sesiones propias.
 */
export async function avisarCancelacion(input: {
  actorUserId: string;
  sessionId: string;
  motivo: string;
  puedeGestionar: boolean;
  ip?: string | null;
}): Promise<{ id: string }> {
  const motivo = exigirMotivo(input.motivo);
  const id = newId();
  await withTransaction(async (tx) => {
    const s = await sesionParaCancelar(input.sessionId, tx);
    if (!input.puedeGestionar && s.guiaEfectivo !== input.actorUserId) {
      throw new ForbiddenError("Solo puedes avisar la cancelación de tus propias sesiones.");
    }
    const viva = await queryOne<{ id: string }>(
      `SELECT id FROM scheduling_cancelacion
        WHERE session_id = $1 AND estado IN ('PENDIENTE', 'APROBADA')`,
      [input.sessionId],
      tx,
    );
    if (viva !== null) throw new ConflictError("Esta sesión ya tiene un aviso de cancelación.");
    await execute(
      `INSERT INTO scheduling_cancelacion
         (id, session_id, classroom_id, fecha, starts_at, guia_user_id, motivo, solicitada_por)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)`,
      [id, s.id, s.classroomId, s.fecha, s.startsAt, s.guiaEfectivo, motivo, input.actorUserId],
      tx,
    );
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.cancelacion_avisada",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: { cancelacionId: id, motivo },
    ip: input.ip ?? null,
  });
  return { id };
}

/**
 * Administración resuelve el aviso: APRUEBA la cancelación (cuenta en las horas
 * del guía que canceló), opcionalmente cubriéndola con otro guía SOLO esa vez,
 * o la RECHAZA (el guía la dicta).
 */
export async function resolverCancelacion(input: {
  actorUserId: string;
  cancelacionId: string;
  aprobar: boolean;
  reemplazoGuiaUserId?: string | null;
  nota?: string | null;
  ip?: string | null;
}): Promise<Cancelacion> {
  const r = await withTransaction((tx) =>
    resolverTx(tx, {
      actorUserId: input.actorUserId,
      cancelacionId: input.cancelacionId,
      aprobar: input.aprobar,
      reemplazoGuiaUserId: input.reemplazoGuiaUserId ?? null,
      nota: input.nota ?? null,
    }),
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: input.aprobar ? "scheduling.cancelacion_aprobada" : "scheduling.cancelacion_rechazada",
    entidad: "scheduling_session",
    entidadId: r.sessionId ?? input.cancelacionId,
    payload: {
      cancelacionId: input.cancelacionId,
      guiaQueCancela: r.guiaUserId,
      reemplazo: input.aprobar ? (input.reemplazoGuiaUserId ?? null) : null,
    },
    ip: input.ip ?? null,
  });
  return detalleCancelacion(input.cancelacionId);
}

/**
 * Administración CANCELA directamente por el guía (el aviso le llegó por otro
 * canal): aviso y aprobación en UNA transacción, con o sin reemplazo.
 */
export async function cancelarPorGuia(input: {
  actorUserId: string;
  sessionId: string;
  motivo: string;
  reemplazoGuiaUserId?: string | null;
  ip?: string | null;
}): Promise<Cancelacion> {
  const motivo = exigirMotivo(input.motivo);
  const id = newId();
  await withTransaction(async (tx) => {
    const s = await sesionParaCancelar(input.sessionId, tx);
    const viva = await queryOne<{ id: string; estado: string }>(
      `SELECT id, estado FROM scheduling_cancelacion
        WHERE session_id = $1 AND estado IN ('PENDIENTE', 'APROBADA')`,
      [input.sessionId],
      tx,
    );
    if (viva !== null) {
      throw new ConflictError(
        viva.estado === "PENDIENTE"
          ? "El guía ya avisó esta cancelación: resuélvela desde su aviso."
          : "Esta sesión ya está cancelada.",
      );
    }
    await execute(
      `INSERT INTO scheduling_cancelacion
         (id, session_id, classroom_id, fecha, starts_at, guia_user_id, motivo, solicitada_por)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)`,
      [id, s.id, s.classroomId, s.fecha, s.startsAt, s.guiaEfectivo, motivo, input.actorUserId],
      tx,
    );
    await resolverTx(tx, {
      actorUserId: input.actorUserId,
      cancelacionId: id,
      aprobar: true,
      reemplazoGuiaUserId: input.reemplazoGuiaUserId ?? null,
      nota: null,
    });
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.cancelacion_aprobada",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: {
      cancelacionId: id,
      directa: true,
      motivo,
      reemplazo: input.reemplazoGuiaUserId ?? null,
    },
    ip: input.ip ?? null,
  });
  return detalleCancelacion(id);
}

export async function detalleCancelacion(id: string): Promise<Cancelacion> {
  const c = await queryOne<Cancelacion>(`${SELECT_CANCELACION} WHERE c.id = $1`, [id]);
  if (c === null) throw new NotFoundError("El aviso de cancelación no existe.");
  return c;
}

/** El aviso vivo (pendiente o aprobado) de una sesión, o el último resuelto. */
export async function cancelacionDeSesion(sessionId: string): Promise<Cancelacion | null> {
  return queryOne<Cancelacion>(
    `${SELECT_CANCELACION} WHERE c.session_id = $1
      ORDER BY (c.estado IN ('PENDIENTE', 'APROBADA')) DESC, c.created_at DESC LIMIT 1`,
    [sessionId],
  );
}

export interface FilaCancelacion extends Cancelacion {
  salon: string | null;
  campania: string | null;
  curso: string | null;
  timezone: string | null;
}

/** Bandeja de administración (Sesiones › Cancelaciones). Pendientes primero. */
export async function listarCancelaciones(filtros: {
  estado?: EstadoCancelacion | "TODAS";
  desde?: string | null;
  hasta?: string | null;
}): Promise<FilaCancelacion[]> {
  const values: unknown[] = [];
  const cond: string[] = [];
  if (filtros.estado !== undefined && filtros.estado !== "TODAS") {
    values.push(filtros.estado);
    cond.push(`c.estado = $${String(values.length)}`);
  }
  if (filtros.desde != null && filtros.desde !== "") {
    values.push(filtros.desde);
    cond.push(`c.fecha >= $${String(values.length)}::date`);
  }
  if (filtros.hasta != null && filtros.hasta !== "") {
    values.push(filtros.hasta);
    cond.push(`c.fecha <= $${String(values.length)}::date`);
  }
  return queryRows<FilaCancelacion>(
    `SELECT ${COLUMNAS_CANCELACION},
            cl.nombre AS salon, ca.nombre AS campania, co.tipo::text AS curso, cl.timezone
       FROM scheduling_cancelacion c
       LEFT JOIN scheduling_classroom cl ON cl.id = c.classroom_id
       LEFT JOIN catalog_course co ON co.id = cl.course_id
       LEFT JOIN catalog_campaign ca ON ca.id = co.campaign_id
      ${cond.length > 0 ? `WHERE ${cond.join(" AND ")}` : ""}
      ORDER BY (c.estado = 'PENDIENTE') DESC, c.starts_at DESC
      LIMIT 500`,
    values,
  );
}

/**
 * SQL: ¿la sesión `alias` NO SE DICTA? Quedó CANCELADA sin que nadie la cubriera,
 * o es un evento SUSPENDIDO desde la Agenda (`suspendida_en`, 2026-10-29). Es lo
 * que impide registrarla o pasar lista, y lo que la saca de las horas dictadas.
 */
export const SQL_SESION_CANCELADA = (alias: string) => `(${alias}.suspendida_en IS NOT NULL
  OR EXISTS (
  SELECT 1 FROM scheduling_cancelacion cx
   WHERE cx.session_id = ${alias}.id AND cx.estado = 'APROBADA'
     AND cx.reemplazo_guia_user_id IS NULL))`;
