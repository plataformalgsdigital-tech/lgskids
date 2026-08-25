import { registrarAuditoria } from "@/modules/audit";
import { NotFoundError } from "@/platform/errors";
import {
  getReferenciaLeccion,
  getReferenciaNivel,
  getReferenciaQuiz,
  updateReferenciaLeccion,
  updateReferenciaNivel,
  updateReferenciaQuiz,
  type ReferenciaLeccion,
  type ReferenciaNivel,
  type ReferenciaQuiz,
} from "../infrastructure/catalog-repository";

export type {
  ReferenciaLeccion,
  ReferenciaNivel,
  ReferenciaQuiz,
} from "../infrastructure/catalog-repository";

/**
 * REFERENCIA CURRICULAR: material, libros, video, actividades y evaluación que
 * cuelgan de cada lección / nivel / quiz del catálogo (adaptación normalizada
 * de la tabla NIVELES de MOSAICO). Lectura y escritura con semántica de MERGE:
 * solo se sobrescriben los campos provistos; los ausentes se conservan.
 */

export async function obtenerReferenciaLeccion(lessonId: string): Promise<ReferenciaLeccion> {
  const ref = await getReferenciaLeccion(lessonId);
  if (ref === null) throw new NotFoundError("La lección no existe.");
  return ref;
}

export async function actualizarReferenciaLeccion(input: {
  actorUserId: string;
  lessonId: string;
  contenido?: string | null | undefined;
  videoUrl?: string | null | undefined;
  material?: unknown[] | undefined;
  materialUsuario?: unknown[] | undefined;
  actividades?: unknown[] | undefined;
  ip?: string | null;
}): Promise<void> {
  const actual = await getReferenciaLeccion(input.lessonId);
  if (actual === null) throw new NotFoundError("La lección no existe.");
  const ref: ReferenciaLeccion = {
    contenido: input.contenido !== undefined ? input.contenido : actual.contenido,
    videoUrl: input.videoUrl !== undefined ? input.videoUrl : actual.videoUrl,
    material: input.material ?? actual.material,
    materialUsuario: input.materialUsuario ?? actual.materialUsuario,
    actividades: input.actividades ?? actual.actividades,
  };
  await updateReferenciaLeccion(input.lessonId, ref);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.referencia_leccion",
    entidad: "catalog_lesson",
    entidadId: input.lessonId,
    payload: {
      material: ref.material.length,
      materialUsuario: ref.materialUsuario.length,
      actividades: ref.actividades.length,
      video: ref.videoUrl !== null,
    },
    ip: input.ip ?? null,
  });
}

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
