import { descargarArchivo, listarArchivos, metaArchivo, subirArchivo } from "@/modules/files";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";
import { PARADAS, PARADA_WELCOME, UNIDADES_MAPA, paradaValida } from "../domain/unidad-mapa";

/**
 * Arte curricular (no dato de menores). Reutiliza el módulo `files` (storage +
 * validación de MIME/tamaño). La última subida por clave es la vigente.
 * Tipos:
 *  - banner: imagen de portada por (curso, nivel) — banner del panel/mapa de isla.
 *  - premio: imagen del premio por (curso, nivel) — brújula/llave/corona/…
 *  - mapa:   mapa del curso completo (todas las islas) por curso.
 *  - unidad: lámina de la UNIDAD por (curso, nivel, unidad 1..4). Es la que
 *    se abre al tocar "Unidad N" en el mapa de la isla.
 *  - vobo:   sello "VoBo" global (marca de unidad vista).
 *  - aviso_login: imagen del aviso de la pantalla de login (global). No es
 *    curricular, pero comparte exactamente el mismo mecanismo; el interruptor
 *    que lo prende/apaga vive en `aviso-login.ts`.
 */

export type ArteTipo =
  "banner" | "premio" | "unidad" | "insignia" | "vobo" | "mapa" | "aviso_login";

/** Unidades NUMERADAS que marca el mapa. El Welcome (parada 0) va aparte. */
export const UNIDADES_POR_NIVEL = UNIDADES_MAPA;

const ENTIDAD_POR_TIPO: Record<ArteTipo, string> = {
  banner: "catalog_imagen_curso",
  premio: "catalog_premio_nivel",
  unidad: "catalog_imagen_unidad",
  // Insignia que se gana al cerrar CADA parada de la isla, Welcome incluido
  // ("Let's chat about me", "Let's explore", …). Distinta del `premio`, que es
  // uno por NIVEL y corona el LEVEL UP.
  insignia: "catalog_insignia_parada",
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
function entidadIdArte(tipo: ArteTipo, curso?: string, nivel?: string, unidad?: number): string {
  if (tipo === "vobo" || tipo === "aviso_login") return "GLOBAL";
  if (!CURSOS.includes(curso ?? "")) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (tipo === "mapa") return curso as string;
  if (!nivelValido(nivel ?? "")) throw new ValidationError(`Nivel inválido: ${nivel}.`);
  // La lámina de unidad va por NÚMERO (1..4), el mismo que marca el mapa: en
  // `catalog_curso` la unidad es texto libre y colgar de ahí la clave la haría
  // frágil ("Unidad 0", "Repaso 3", erratas incluidas).
  if (tipo === "unidad" || tipo === "insignia") {
    if (!unidadValida(unidad)) {
      throw new ValidationError(
        `Parada inválida: ${String(unidad)} (${String(PARADA_WELCOME)} a ` +
          `${String(UNIDADES_MAPA)}; la ${String(PARADA_WELCOME)} es el Welcome).`,
      );
    }
    return `${curso}:${nivel}:${String(unidad)}`;
  }
  // banner / premio → por (curso, nivel)
  return `${curso}:${nivel}`;
}

function unidadValida(unidad?: number): boolean {
  return paradaValida(unidad);
}

/** ¿los parámetros forman una clave válida para el tipo? (sin lanzar). */
function claveValida(tipo: ArteTipo, curso?: string, nivel?: string, unidad?: number): boolean {
  if (tipo === "vobo" || tipo === "aviso_login") return true;
  if (!CURSOS.includes(curso ?? "")) return false;
  if (tipo === "mapa") return true;
  if (!nivelValido(nivel ?? "")) return false;
  return tipo === "unidad" || tipo === "insignia" ? unidadValida(unidad) : true;
}

/**
 * El arte es SIEMPRE una imagen. `files` acepta además PDF y audio, así que
 * aquí se acota: un mp3 guardado como banner no falla al subirlo, falla al
 * pintarlo — mucho después y mucho más difícil de entender.
 */
const MIMES_ARTE = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function subirArte(input: {
  actorUserId: string;
  tipo: ArteTipo;
  curso?: string;
  nivel?: string;
  /** Solo para el tipo `unidad`: 1..4, el número que marca el mapa. */
  unidad?: number;
  nombreOriginal: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ id: string }> {
  if (!MIMES_ARTE.has(input.mime)) {
    throw new ValidationError(`El arte debe ser una imagen JPG, PNG o WebP (llegó ${input.mime}).`);
  }
  return subirArchivo({
    actorUserId: input.actorUserId,
    nombreOriginal: input.nombreOriginal,
    mime: input.mime,
    bytes: input.bytes,
    entidad: ENTIDAD_POR_TIPO[input.tipo],
    entidadId: entidadIdArte(input.tipo, input.curso, input.nivel, input.unidad),
  });
}

/** id del arte vigente para la clave del tipo, o null si no hay. */
export async function arteId(
  tipo: ArteTipo,
  curso?: string,
  nivel?: string,
  unidad?: number,
): Promise<string | null> {
  if (!claveValida(tipo, curso, nivel, unidad)) return null;
  const archivos = await listarArchivos({
    entidad: ENTIDAD_POR_TIPO[tipo],
    entidadId: entidadIdArte(tipo, curso, nivel, unidad),
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

/**
 * Sirve arte por id, y SOLO imágenes.
 *
 * Esta ruta sirve en línea con el MIME guardado, y `files` guarda también PDF,
 * audio y el HTML del libro interactivo. Sin el filtro, el id de ese HTML
 * abierto aquí correría fuera de su caja, en el origen de la plataforma y con
 * la sesión de quien lo abra.
 */
export async function descargarImagenCurso(id: string): Promise<{
  meta: { nombreOriginal: string; mime: string };
  bytes: Buffer;
}> {
  const meta = await metaArchivo(id);
  if (meta === null || !MIMES_ARTE.has(meta.mime)) {
    throw new NotFoundError("La imagen no existe.");
  }
  return descargarArchivo(id);
}

/**
 * Láminas de las paradas de un nivel: `{ 0: url|null, ... 4: url|null }`.
 *
 * Incluye la parada 0 (Welcome): el mapa nuevo le da cartel propio, así que
 * también puede tener su lámina.
 */
export async function imagenesUnidadNivel(
  curso: string,
  nivel: string,
): Promise<Record<number, string | null>> {
  const ids = await Promise.all(PARADAS.map((p) => arteId("unidad", curso, nivel, p)));
  return Object.fromEntries(PARADAS.map((p, i) => [p, ids[i] ?? null])) as Record<
    number,
    string | null
  >;
}

/** Insignias de las paradas de un nivel: `{ 0: url|null, ... 4: url|null }`. */
export async function insigniasDeNivel(
  curso: string,
  nivel: string,
): Promise<Record<number, string | null>> {
  const ids = await Promise.all(PARADAS.map((p) => arteId("insignia", curso, nivel, p)));
  return Object.fromEntries(PARADAS.map((p, i) => [p, ids[i] ?? null])) as Record<
    number,
    string | null
  >;
}
