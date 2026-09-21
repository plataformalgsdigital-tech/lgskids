import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Videos del libro interactivo: reglas puras.
 *
 * El libro deja de llevar los videos incrustados y los pide por RUTA RELATIVA,
 * `videos/<página>-<n>.mp4`: el primer video de la página 7 es `videos/7-1.mp4`,
 * el segundo de la 14, `videos/14-2.mp4`. Es un contrato con diseño, y es el de
 * cualquier sitio web: diseño lo prueba en su equipo con una carpeta `videos/`
 * junto al HTML, y la plataforma responde esa misma ruta con el video subido.
 *
 * La CASILLA (página, n) es del libro, no del archivo HTML: reemplazar el HTML
 * de un nivel no toca sus videos.
 *
 * La página es la que VE el niño —arriba a la derecha, "Página 10 / 28"—, no el
 * índice del código del libro (`openPage(9)`, la clave `"9"` de
 * `LESSON_VIDEOS`), que va uno por detrás. Se comprobó en el libro de Rookie:
 * con los dos números en juego, quien carga los videos mira el libro, ve
 * "Página 10" y los pondría en la 9.
 */

export const PAGINA_MIN = 1;
export const PAGINA_MAX = 999;
/** Una página puede llevar varios videos (la 14 de Rookie trae dos). */
export const ORDEN_MIN = 1;
export const ORDEN_MAX = 9;

export type EstadoVideo = "PROCESANDO" | "BORRADOR" | "PUBLICADO" | "ERROR";

/** Lo que el navegador del equipo manda como video original. */
export const TAMANO_MAXIMO_VIDEO_SUBIDA = 300 * 1024 * 1024;
/** Tras comprimir no debería pasar de unos pocos MB; el tope es por si acaso. */
export const TAMANO_MAXIMO_VIDEO_FINAL = 100 * 1024 * 1024;
/** Una canción dura 2–4 minutos; 20 es margen de sobra y frena errores. */
export const DURACION_MAXIMA_VIDEO_SEG = 20 * 60;
/**
 * Un video que lleva más que esto "procesando" se da por perdido: el servidor
 * se reinició a medio comprimir y nadie va a terminarlo.
 */
export const MINUTOS_MAX_PROCESANDO = 20;

export function casillaValida(pagina: unknown, orden: unknown): boolean {
  return (
    Number.isInteger(pagina) &&
    Number.isInteger(orden) &&
    (pagina as number) >= PAGINA_MIN &&
    (pagina as number) <= PAGINA_MAX &&
    (orden as number) >= ORDEN_MIN &&
    (orden as number) <= ORDEN_MAX
  );
}

/** `7-1.mp4`: el nombre del archivo dentro de `videos/`. */
export function nombreArchivoVideo(pagina: number, orden: number): string {
  return `${String(pagina)}-${String(orden)}.mp4`;
}

/** `videos/7-1.mp4`: lo que diseño escribe en el libro. */
export function rutaVideoLibro(pagina: number, orden: number): string {
  return `videos/${nombreArchivoVideo(pagina, orden)}`;
}

/** Inverso de `nombreArchivoVideo`; null si no es una casilla válida. */
export function leerNombreArchivoVideo(nombre: string): { pagina: number; orden: number } | null {
  const m = /^(\d{1,3})-(\d)\.mp4$/.exec(nombre);
  if (m === null) return null;
  const pagina = Number(m[1]);
  const orden = Number(m[2]);
  return casillaValida(pagina, orden) ? { pagina, orden } : null;
}

// —— Token de los videos ————————————————————————————————————————————————

/**
 * Cuánto vive un token. El panel pide uno nuevo cada vez que abre el libro,
 * así que basta con cubrir una sesión larga de lectura.
 */
export const VIGENCIA_TOKEN_VIDEOS_SEG = 12 * 60 * 60;

/**
 * Por qué un token y no la sesión: el libro corre aislado (origen opaco) y
 * Chrome NO manda la cookie de sesión en las peticiones que salen de él —
 * probado: el video llega al servidor sin cookie. El token viaja en la RUTA,
 * así que la ruta relativa `videos/7-1.mp4` lo lleva sola.
 *
 * Firma `materialId` + vencimiento con HMAC-SHA256: sirve para ESE libro y
 * hasta esa hora, y no se puede fabricar sin el secreto.
 */
function firma(materialId: string, venceEn: number, secreto: string): string {
  return createHmac("sha256", secreto)
    .update(`videos-libro:${materialId}:${String(venceEn)}`)
    .digest("base64url");
}

export function firmarTokenVideos(materialId: string, venceEn: number, secreto: string): string {
  return `${String(venceEn)}.${firma(materialId, venceEn, secreto)}`;
}

/** `ahora` en segundos desde epoch. Compara la firma en tiempo constante. */
export function tokenVideosValido(
  materialId: string,
  token: string,
  secreto: string,
  ahora: number,
): boolean {
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (m === null) return false;
  const venceEn = Number(m[1]);
  if (venceEn < ahora) return false;
  const esperada = Buffer.from(firma(materialId, venceEn, secreto));
  const recibida = Buffer.from(m[2] ?? "");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
