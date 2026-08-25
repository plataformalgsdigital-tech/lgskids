import { registrarAuditoria } from "@/modules/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import {
  deleteCursoReferencia,
  existsCursoReferenciaKey,
  getCursoReferencia,
  insertCursoReferencia,
  listCursoReferencia,
  updateCursoReferencia,
  type CursoReferenciaInput,
  type CursoReferenciaRow,
} from "../infrastructure/catalog-repository";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";

export type { CursoReferenciaRow } from "../infrastructure/catalog-repository";

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const NIVELES_CODIGO = NIVELES.map((n) => n.codigo) as readonly string[];

/**
 * REFERENCIA MAESTRA de cursos (catalog_curso): una fila por
 * (curso, nivel, unidad, leccion) con el material/video/actividades/recursos.
 * Independiente de campañas — es la fuente para los paneles de alumno/guía y
 * las actividades de seguimiento.
 */

interface DatosCurso {
  curso: string;
  nivel: string;
  unidad?: string | null | undefined;
  quiz?: unknown;
  leccion: string;
  orden?: number | undefined;
  contenido?: string | null | undefined;
  video?: string | null | undefined;
  clubes?: unknown[] | undefined;
  materialUsuario?: unknown[] | undefined;
  materialGuia?: unknown[] | undefined;
  actividades?: unknown[] | undefined;
  recursos?: unknown[] | undefined;
}

function normalizar(d: DatosCurso): CursoReferenciaInput {
  if (!CURSOS.includes(d.curso)) {
    throw new ValidationError(`Curso inválido: ${d.curso} (JUNIOR | YOUNGSTER).`);
  }
  if (!NIVELES_CODIGO.includes(d.nivel)) {
    throw new ValidationError(`Nivel inválido: ${d.nivel}.`);
  }
  if (d.leccion.trim().length < 1) {
    throw new ValidationError("La lección es obligatoria.");
  }
  return {
    curso: d.curso,
    nivel: d.nivel,
    unidad: d.unidad?.trim() || null,
    quiz: d.quiz ?? null,
    leccion: d.leccion.trim(),
    orden: d.orden ?? 0,
    contenido: d.contenido ?? null,
    video: d.video ?? null,
    clubes: d.clubes ?? [],
    materialUsuario: d.materialUsuario ?? [],
    materialGuia: d.materialGuia ?? [],
    actividades: d.actividades ?? [],
    recursos: d.recursos ?? [],
  };
}

export async function listarCursoReferencia(filtros?: {
  curso?: string | undefined;
  nivel?: string | undefined;
}): Promise<CursoReferenciaRow[]> {
  return listCursoReferencia(filtros);
}

export async function obtenerCursoReferencia(id: string): Promise<CursoReferenciaRow> {
  const row = await getCursoReferencia(id);
  if (row === null) throw new NotFoundError("La referencia de curso no existe.");
  return row;
}

export async function crearCursoReferencia(
  input: { actorUserId: string; ip?: string | null } & DatosCurso,
): Promise<{ id: string }> {
  const datos = normalizar(input);
  if (await existsCursoReferenciaKey(datos.curso, datos.nivel, datos.unidad, datos.leccion)) {
    throw new ConflictError(
      `Ya existe "${datos.leccion}" para ${datos.curso} · ${datos.nivel}${datos.unidad ? ` · ${datos.unidad}` : ""}.`,
    );
  }
  const id = newId();
  await insertCursoReferencia(id, datos);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.curso_referencia_creada",
    entidad: "catalog_curso",
    entidadId: id,
    payload: { curso: datos.curso, nivel: datos.nivel, leccion: datos.leccion },
    ip: input.ip ?? null,
  });
  return { id };
}

export async function actualizarCursoReferencia(
  input: { actorUserId: string; id: string; ip?: string | null } & DatosCurso,
): Promise<void> {
  const actual = await getCursoReferencia(input.id);
  if (actual === null) throw new NotFoundError("La referencia de curso no existe.");
  const datos = normalizar(input);
  if (
    await existsCursoReferenciaKey(datos.curso, datos.nivel, datos.unidad, datos.leccion, input.id)
  ) {
    throw new ConflictError(
      `Ya existe "${datos.leccion}" para ${datos.curso} · ${datos.nivel}${datos.unidad ? ` · ${datos.unidad}` : ""}.`,
    );
  }
  await updateCursoReferencia(input.id, datos);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.curso_referencia_editada",
    entidad: "catalog_curso",
    entidadId: input.id,
    payload: { curso: datos.curso, nivel: datos.nivel, leccion: datos.leccion },
    ip: input.ip ?? null,
  });
}

export async function eliminarCursoReferencia(input: {
  actorUserId: string;
  id: string;
  ip?: string | null;
}): Promise<void> {
  const actual = await getCursoReferencia(input.id);
  if (actual === null) throw new NotFoundError("La referencia de curso no existe.");
  await deleteCursoReferencia(input.id);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.curso_referencia_eliminada",
    entidad: "catalog_curso",
    entidadId: input.id,
    payload: { curso: actual.curso, nivel: actual.nivel, leccion: actual.leccion },
    ip: input.ip ?? null,
  });
}
