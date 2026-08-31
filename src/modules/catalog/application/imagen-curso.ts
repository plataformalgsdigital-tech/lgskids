import { descargarArchivo, listarArchivos, subirArchivo } from "@/modules/files";
import { ValidationError } from "@/platform/errors";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";

/**
 * Arte curricular (no dato de menores). Reutiliza el módulo `files` (storage +
 * validación de MIME/tamaño). La última subida por clave es la vigente.
 * Tipos:
 *  - banner: imagen de portada por (curso, nivel) — banner del panel/mapa de isla.
 *  - premio: imagen del premio por (curso, nivel) — brújula/llave/corona/…
 *  - mapa:   mapa del curso completo (todas las islas) por curso.
 *  - vobo:   sello "VoBo" global (marca de unidad vista).
 *  - aviso_login: imagen del aviso de la pantalla de login (global). No es
 *    curricular, pero comparte exactamente el mismo mecanismo; el interruptor
 *    que lo prende/apaga vive en `aviso-login.ts`.
 */

export type ArteTipo = "banner" | "premio" | "vobo" | "mapa" | "aviso_login";

const ENTIDAD_POR_TIPO: Record<ArteTipo, string> = {
  banner: "catalog_imagen_curso",
  premio: "catalog_premio_nivel",
  mapa: "catalog_mapa_curso",
  vobo: "catalog_vobo",
  aviso_login: "login_aviso",
};

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const NIVELES_CODIGO = NIVELES.map((n) => n.codigo) as readonly string[];

/**
 * Nivel especial: imagen de portada para TODO el curso (cubre los niveles sin
 * imagen propia). Solo aplica al banner (respaldo).
 */
export const NIVEL_TODOS = "TODOS";

function nivelValido(nivel: string): boolean {
  return nivel === NIVEL_TODOS || NIVELES_CODIGO.includes(nivel);
}

/** entidadId (clave natural) por tipo, validando los parámetros que aplican. */
function entidadIdArte(tipo: ArteTipo, curso?: string, nivel?: string): string {
  if (tipo === "vobo" || tipo === "aviso_login") return "GLOBAL";
  if (!CURSOS.includes(curso ?? "")) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (tipo === "mapa") return curso as string;
  // banner / premio → por (curso, nivel)
  if (!nivelValido(nivel ?? "")) throw new ValidationError(`Nivel inválido: ${nivel}.`);
  return `${curso}:${nivel}`;
}

/** ¿los parámetros forman una clave válida para el tipo? (sin lanzar). */
function claveValida(tipo: ArteTipo, curso?: string, nivel?: string): boolean {
  if (tipo === "vobo" || tipo === "aviso_login") return true;
  if (!CURSOS.includes(curso ?? "")) return false;
  if (tipo === "mapa") return true;
  return nivelValido(nivel ?? "");
}

export async function subirArte(input: {
  actorUserId: string;
  tipo: ArteTipo;
  curso?: string;
  nivel?: string;
  nombreOriginal: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ id: string }> {
  return subirArchivo({
    actorUserId: input.actorUserId,
    nombreOriginal: input.nombreOriginal,
    mime: input.mime,
    bytes: input.bytes,
    entidad: ENTIDAD_POR_TIPO[input.tipo],
    entidadId: entidadIdArte(input.tipo, input.curso, input.nivel),
  });
}

/** id del arte vigente para la clave del tipo, o null si no hay. */
export async function arteId(tipo: ArteTipo, curso?: string, nivel?: string): Promise<string | null> {
  if (!claveValida(tipo, curso, nivel)) return null;
  const archivos = await listarArchivos({
    entidad: ENTIDAD_POR_TIPO[tipo],
    entidadId: entidadIdArte(tipo, curso, nivel),
    limit: 1,
  });
  return archivos[0]?.id ?? null;
}

// —— Banner (compatibilidad con lo existente) ——————————————————————————

export async function subirImagenCurso(input: {
  actorUserId: string;
  curso: string;
  nivel: string;
  nombreOriginal: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ id: string }> {
  return subirArte({ ...input, tipo: "banner" });
}

/** id del banner vigente para (curso, nivel), o null. Acepta NIVEL_TODOS. */
export async function imagenCursoId(curso: string, nivel: string): Promise<string | null> {
  return arteId("banner", curso, nivel);
}

/**
 * id del banner a mostrar: el del nivel concreto y, si no existe, el de TODO el
 * curso (respaldo). null si no hay ninguno.
 */
export async function imagenCursoIdResuelto(curso: string, nivel: string): Promise<string | null> {
  const propia = await imagenCursoId(curso, nivel);
  if (propia !== null) return propia;
  return imagenCursoId(curso, NIVEL_TODOS);
}

// —— Premio por nivel (Fase A: "¿Cómo voy?") ——————————————————————————

/** id de la imagen del premio para (curso, nivel), o null. */
export async function premioNivelId(curso: string, nivel: string): Promise<string | null> {
  return arteId("premio", curso, nivel);
}

// —— Mapa del curso y VoBo (Fase B: pantalla "Avance") ————————————————

export async function mapaCursoId(curso: string): Promise<string | null> {
  return arteId("mapa", curso);
}

export async function voboId(): Promise<string | null> {
  return arteId("vobo");
}

export async function descargarImagenCurso(id: string): Promise<{
  meta: { nombreOriginal: string; mime: string };
  bytes: Buffer;
}> {
  return descargarArchivo(id);
}
