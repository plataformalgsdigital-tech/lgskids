import { registrarAuditoria } from "@/modules/audit";
import { recalcularProgresion } from "@/modules/progression";
import { withTransaction } from "@/platform/db/transaction";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  getMarcasDeSesion,
  getRosterConPais,
  getSessionInfo,
  paisesConFeriado,
  upsertMarca,
  type SessionInfo,
} from "../infrastructure/attendance-repository";

export type EstadoAsistencia = "PRESENTE" | "AUSENTE" | "JUSTIFICADO";

export interface FilaLista {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  paisContrato: string;
  /**
   * POLÍTICA DE FERIADOS (docs/operacion/politica-feriados-asistencia.md):
   * la fecha es feriado en el país del NIÑO (no en el calendario del salón,
   * que sí habría suspendido la sesión). El Guía puede marcar JUSTIFICADO.
   */
  feriadoEnSuPais: boolean;
  marca: { estado: EstadoAsistencia; justificacion: string | null } | null;
}

export interface ListaDeSesion {
  sesion: SessionInfo;
  lista: FilaLista[];
}

/**
 * ALCANCE DEL GUÍA (regla dura 6): un guía solo puede ver/gestionar sesiones
 * de SUS propios salones. admin/coordinador (que pueden gestionar cualquier
 * salón) no tienen esta restricción. Se verifica en el SERVIDOR, no en la UI.
 */
export async function verificarAccesoGuia(
  sessionId: string,
  actor: { userId: string; puedeGestionarCualquierSalon: boolean },
): Promise<void> {
  if (actor.puedeGestionarCualquierSalon) return;
  const sesion = await getSessionInfo(sessionId);
  if (sesion === null) throw new NotFoundError("La sesión no existe.");
  if (sesion.guiaUserId !== actor.userId) {
    throw new ForbiddenError("Solo puedes gestionar las sesiones de tus propios salones.");
  }
}

/** Lista de la sesión: roster derivado + marcas existentes + aviso de feriado. */
export async function listaDeSesion(sessionId: string): Promise<ListaDeSesion> {
  const sesion = await getSessionInfo(sessionId);
  if (sesion === null) throw new NotFoundError("La sesión no existe.");

  const roster = await getRosterConPais(sesion.classroomId);
  const feriados = await paisesConFeriado(sesion.fecha, [
    ...new Set(roster.map((r) => r.paisContrato)),
  ]);
  const marcas = new Map(
    (await getMarcasDeSesion(sessionId)).map((m) => [
      m.childPersonId,
      { estado: m.estado as EstadoAsistencia, justificacion: m.justificacion },
    ]),
  );

  return {
    sesion,
    lista: roster.map((r) => ({
      ...r,
      feriadoEnSuPais: feriados.has(r.paisContrato),
      marca: marcas.get(r.childPersonId) ?? null,
    })),
  };
}

/**
 * MARCA la asistencia (individual o masiva: mismo camino). Upsert por niño;
 * JUSTIFICADO exige justificación. Auditado con conteos.
 *
 * NOTA FASE 9: este es uno de los caminos que dispararán LA función central
 * de progresión (evento AsistenciaRegistrada). El enganche se hace en la
 * Fase 9 — aquí queda el punto único por el que pasa TODA marca.
 */
export async function marcarAsistencia(input: {
  actorUserId: string;
  sessionId: string;
  marcas: { childPersonId: string; estado: EstadoAsistencia; justificacion?: string | null }[];
  ip?: string | null;
}): Promise<{ marcadas: number }> {
  if (input.marcas.length === 0) {
    throw new ValidationError("No hay marcas que registrar.");
  }
  const sesion = await getSessionInfo(input.sessionId);
  if (sesion === null) throw new NotFoundError("La sesión no existe.");

  const roster = new Set((await getRosterConPais(sesion.classroomId)).map((r) => r.childPersonId));
  for (const marca of input.marcas) {
    if (!roster.has(marca.childPersonId)) {
      throw new ValidationError(
        "Hay un niño que no pertenece a la lista actual del salón (¿cambio académico reciente?).",
      );
    }
    if (marca.estado === "JUSTIFICADO" && !marca.justificacion?.trim()) {
      throw new ValidationError("Las ausencias JUSTIFICADAS requieren la justificación.");
    }
  }

  await withTransaction(async (tx) => {
    for (const marca of input.marcas) {
      await upsertMarca(tx, {
        sessionId: input.sessionId,
        childPersonId: marca.childPersonId,
        estado: marca.estado,
        justificacion: marca.justificacion?.trim() || null,
        marcadoPor: input.actorUserId,
      });
    }
  });

  // CAMINO 1 de LA FUNCIÓN CENTRAL (regla dura 4): toda marca de
  // asistencia dispara el recálculo de progresión de cada niño afectado.
  for (const childPersonId of new Set(input.marcas.map((m) => m.childPersonId))) {
    await recalcularProgresion(childPersonId);
  }

  const conteos = input.marcas.reduce<Record<string, number>>((acc, m) => {
    acc[m.estado] = (acc[m.estado] ?? 0) + 1;
    return acc;
  }, {});
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "attendance.marcada",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: { salon: sesion.salon, fecha: sesion.fecha, ...conteos },
    ip: input.ip ?? null,
  });
  return { marcadas: input.marcas.length };
}
