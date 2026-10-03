import { registrarAuditoria } from "@/modules/audit";
import { recalcularProgresion } from "@/modules/progression";
import { withTransaction } from "@/platform/db/transaction";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  getMarcasDeSesion,
  getRosterConPais,
  getSessionInfo,
  historialDeNino,
  paisesConFeriado,
  salonActivoDeNino,
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
  marca: {
    estado: EstadoAsistencia;
    justificacion: string | null;
    /** Ficha que el guía llena por alumno (participación, comentarios, aviso). */
    participo: boolean;
    comentarioUsuario: string | null;
    notaPrivada: string | null;
    requiereAtencion: boolean;
  } | null;
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

export interface FilaAsistenciaNino {
  sessionId: string;
  salon: string;
  tipo: string;
  fecha: string;
  startsAt: Date;
  guia: string | null;
  meetingUrl: string | null;
  claseNumero: number | null;
  leccion: string | null;
  leccionNivel: string | null;
  estado: EstadoAsistencia | null;
  justificacion: string | null;
  /**
   * Se puede marcar desde la ficha: solo las sesiones de su salón ACTUAL. La
   * marca pasa por `marcarAsistencia`, que exige que el niño esté en la lista
   * del salón; en un salón que dejó, la rechazaría.
   */
  editable: boolean;
}

/**
 * Tabla de asistencia de la ficha del niño. El guía sin `salones.gestionar`
 * ve solo las sesiones que dictó él (regla 6: el alcance del guía se aplica
 * en el servidor).
 */
export async function asistenciaDeNino(
  childPersonId: string,
  actor: { userId: string; puedeGestionarCualquierSalon: boolean },
): Promise<{ filas: FilaAsistenciaNino[] }> {
  const [filas, salonActivo] = await Promise.all([
    historialDeNino(childPersonId),
    salonActivoDeNino(childPersonId),
  ]);
  return {
    filas: filas
      .filter((f) => actor.puedeGestionarCualquierSalon || f.guiaUserId === actor.userId)
      .map((f) => ({
        sessionId: f.sessionId,
        salon: f.salon,
        tipo: f.tipo,
        fecha: f.fecha,
        startsAt: f.startsAt,
        guia: f.guia,
        meetingUrl: f.meetingUrl,
        claseNumero: f.claseNumero,
        leccion: f.leccion,
        leccionNivel: f.leccionNivel,
        estado: f.estado as EstadoAsistencia | null,
        justificacion: f.justificacion,
        editable: f.classroomId === salonActivo,
      })),
  };
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
      {
        estado: m.estado as EstadoAsistencia,
        justificacion: m.justificacion,
        participo: m.participo,
        comentarioUsuario: m.comentarioUsuario,
        notaPrivada: m.notaPrivada,
        requiereAtencion: m.requiereAtencion,
      },
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
  marcas: {
    childPersonId: string;
    estado: EstadoAsistencia;
    justificacion?: string | null;
    /**
     * Campos de la ficha. Se omiten en la marca masiva: lo que no llega,
     * no se toca (el upsert conserva el valor anterior).
     */
    participo?: boolean | undefined;
    comentarioUsuario?: string | null | undefined;
    notaPrivada?: string | null | undefined;
    requiereAtencion?: boolean | undefined;
  }[];
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
        participo: marca.participo,
        comentarioUsuario: marca.comentarioUsuario,
        notaPrivada: marca.notaPrivada,
        requiereAtencion: marca.requiereAtencion,
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
