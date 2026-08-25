import { registrarAuditoria } from "@/modules/audit";
import { NotFoundError } from "@/platform/errors";
import {
  getReferenciaNivel,
  getReferenciaQuiz,
  updateReferenciaNivel,
  updateReferenciaQuiz,
  type ReferenciaNivel,
  type ReferenciaQuiz,
} from "../infrastructure/catalog-repository";

export type { ReferenciaNivel, ReferenciaQuiz } from "../infrastructure/catalog-repository";

/**
 * REFERENCIA a nivel de NIVEL y QUIZ (pendiente de decidir si se conservan; el
 * material a nivel de lección/curso vive en la tabla maestra catalog_curso).
 * Lectura y escritura con MERGE: solo se sobrescriben los campos provistos.
 */

export async function obtenerReferenciaNivel(levelId: string): Promise<ReferenciaNivel> {
  const ref = await getReferenciaNivel(levelId);
  if (ref === null) throw new NotFoundError("El nivel no existe.");
  return ref;
}

export async function actualizarReferenciaNivel(input: {
  actorUserId: string;
  levelId: string;
  descripcion?: string | null | undefined;
  recursos?: unknown[] | undefined;
  ip?: string | null;
}): Promise<void> {
  const actual = await getReferenciaNivel(input.levelId);
  if (actual === null) throw new NotFoundError("El nivel no existe.");
  const ref: ReferenciaNivel = {
    descripcion: input.descripcion !== undefined ? input.descripcion : actual.descripcion,
    recursos: input.recursos ?? actual.recursos,
  };
  await updateReferenciaNivel(input.levelId, ref);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.referencia_nivel",
    entidad: "catalog_level",
    entidadId: input.levelId,
    payload: { recursos: ref.recursos.length },
    ip: input.ip ?? null,
  });
}

export async function obtenerReferenciaQuiz(quizId: string): Promise<ReferenciaQuiz> {
  const ref = await getReferenciaQuiz(quizId);
  if (ref === null) throw new NotFoundError("El cuestionario no existe.");
  return ref;
}

export async function actualizarReferenciaQuiz(input: {
  actorUserId: string;
  quizId: string;
  modo?: "IA" | "MANUAL" | undefined;
  minutos?: number | null | undefined;
  preguntas?: unknown[] | undefined;
  ip?: string | null;
}): Promise<void> {
  const actual = await getReferenciaQuiz(input.quizId);
  if (actual === null) throw new NotFoundError("El cuestionario no existe.");
  const ref: ReferenciaQuiz = {
    modo: input.modo ?? actual.modo,
    minutos: input.minutos !== undefined ? input.minutos : actual.minutos,
    preguntas: input.preguntas ?? actual.preguntas,
  };
  await updateReferenciaQuiz(input.quizId, ref);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.referencia_quiz",
    entidad: "catalog_quiz",
    entidadId: input.quizId,
    payload: { modo: ref.modo, minutos: ref.minutos, preguntas: ref.preguntas.length },
    ip: input.ip ?? null,
  });
}
