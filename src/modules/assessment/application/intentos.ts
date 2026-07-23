import { registrarAuditoria } from "@/modules/audit";
import { recalcularProgresion } from "@/modules/progression";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { esAprobado, validarScore } from "../domain/calificacion";
import {
  attemptsDeNino,
  getQuizInfo,
  insertAttempt,
  ninoMatriculadoEnCurso,
  tieneAprobado,
  type AttemptListItem,
} from "../infrastructure/attempt-repository";

/**
 * REGISTRA un intento de cuestionario (práctica o Level Up) y lo califica.
 *
 * NOTA FASE 9: este es el segundo camino que disparará LA función central de
 * progresión (evento CuestionarioAprobado — en particular el LEVEL_UP
 * aprobado promueve de nivel). El enganche llega en la Fase 9; TODO intento
 * pasa por aquí.
 */
export async function registrarIntento(input: {
  actorUserId: string;
  childPersonId: string;
  quizId: string;
  score: number;
  ip?: string | null;
}): Promise<{
  id: string;
  aprobado: boolean;
  tipo: string;
  progresion: { nivelActual: string | null; medallasNuevas: number; diplomaNuevo: boolean } | null;
}> {
  validarScore(input.score);

  const quiz = await getQuizInfo(input.quizId);
  if (quiz === null) throw new NotFoundError("El cuestionario no existe.");

  const matriculado = await ninoMatriculadoEnCurso(input.childPersonId, quiz.courseId);
  if (!matriculado) {
    throw new ValidationError("El niño no está matriculado en el curso de este cuestionario.");
  }

  const aprobado = esAprobado(input.score);
  const id = await insertAttempt({
    quizId: input.quizId,
    childPersonId: input.childPersonId,
    score: input.score,
    aprobado,
    registradoPor: input.actorUserId,
  });

  // CAMINO 2 de LA FUNCIÓN CENTRAL (regla dura 4): todo intento calificado
  // dispara el recálculo (el LEVEL_UP aprobado es el que promueve).
  const progreso = await recalcularProgresion(input.childPersonId);

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: aprobado ? "assessment.aprobado" : "assessment.intento",
    entidad: "catalog_quiz",
    entidadId: input.quizId,
    payload: {
      childPersonId: input.childPersonId,
      tipo: quiz.tipo,
      nivel: quiz.nivel,
      score: input.score,
    },
    ip: input.ip ?? null,
  });
  return { id, aprobado, tipo: quiz.tipo, progresion: progreso };
}

export async function intentosDeNino(childPersonId: string): Promise<AttemptListItem[]> {
  return attemptsDeNino(childPersonId);
}

export { tieneAprobado };
