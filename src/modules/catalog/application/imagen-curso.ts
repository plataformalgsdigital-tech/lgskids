import { descargarArchivo, listarArchivos, subirArchivo } from "@/modules/files";
import { ValidationError } from "@/platform/errors";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";

/**
 * Imagen de portada por (curso, nivel). Reutiliza el módulo `files` (storage +
 * validación de MIME/tamaño) — se guarda con entidad `catalog_imagen_curso` y
 * entidadId `CURSO:NIVEL`. La última subida es la vigente. Es arte curricular
 * (no dato de menores): el panel del alumno la muestra como banner del curso.
 */

const ENTIDAD = "catalog_imagen_curso";
const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const NIVELES_CODIGO = NIVELES.map((n) => n.codigo) as readonly string[];

/**
 * Nivel especial: imagen de portada para TODO el curso (cubre todos los niveles).
 * Se usa como respaldo cuando un nivel concreto no tiene su propia imagen.
 */
export const NIVEL_TODOS = "TODOS";

function nivelValido(nivel: string): boolean {
  return nivel === NIVEL_TODOS || NIVELES_CODIGO.includes(nivel);
}

function clave(curso: string, nivel: string): string {
  return `${curso}:${nivel}`;
}

function validar(curso: string, nivel: string): void {
  if (!CURSOS.includes(curso)) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (!nivelValido(nivel)) throw new ValidationError(`Nivel inválido: ${nivel}.`);
}

export async function subirImagenCurso(input: {
  actorUserId: string;
  curso: string;
  nivel: string;
  nombreOriginal: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ id: string }> {
  validar(input.curso, input.nivel);
  return subirArchivo({
    actorUserId: input.actorUserId,
    nombreOriginal: input.nombreOriginal,
    mime: input.mime,
    bytes: input.bytes,
    entidad: ENTIDAD,
    entidadId: clave(input.curso, input.nivel),
  });
}

/** id de la imagen vigente para (curso, nivel), o null si no hay. Acepta NIVEL_TODOS. */
export async function imagenCursoId(curso: string, nivel: string): Promise<string | null> {
  if (!CURSOS.includes(curso) || !nivelValido(nivel)) return null;
  const archivos = await listarArchivos({ entidad: ENTIDAD, entidadId: clave(curso, nivel), limit: 1 });
  return archivos[0]?.id ?? null;
}

/**
 * id de la imagen a mostrar en el panel del alumno: la del nivel concreto y, si
 * no existe, la imagen de TODO el curso (respaldo). null si no hay ninguna.
 */
export async function imagenCursoIdResuelto(curso: string, nivel: string): Promise<string | null> {
  const propia = await imagenCursoId(curso, nivel);
  if (propia !== null) return propia;
  return imagenCursoId(curso, NIVEL_TODOS);
}

export async function descargarImagenCurso(id: string): Promise<{
  meta: { nombreOriginal: string; mime: string };
  bytes: Buffer;
}> {
  return descargarArchivo(id);
}
