import sharp from "sharp";
import { logger } from "@/platform/logging/logger";

/**
 * Optimiza una imagen ANTES de guardarla.
 *
 * El arte llegaba tal cual salía del diseñador: los banners promediaban 1,96 MB
 * y las láminas 2,1 MB, con picos de 3,1 MB. Un niño abriendo su panel desde
 * una tablet bajaba varios megas por pantalla, y de ahí venían las imágenes
 * que "a veces no cargan".
 *
 * Se reencoda a **WebP**, que es el único formato de imagen que la plataforma
 * sirve al alumno y conserva TRANSPARENCIA — los premios y el VoBo son PNG con
 * alfa y perderla los rompería sobre cualquier fondo.
 *
 * Dos cosas que NO hace a propósito:
 *  - No AGRANDA: `withoutEnlargement` deja en paz lo que ya es pequeño (el
 *    VoBo son 44 kB; reencodarlo hacia arriba sería trabajo para empeorarlo).
 *  - No toca PDF ni audio. Aquí solo entran imágenes.
 */

/** Lado máximo. 1600 px cubre una pantalla 2× sin que nadie note el recorte. */
export const LADO_MAXIMO = 1600;
const CALIDAD = 82;

const OPTIMIZABLES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ImagenOptimizada {
  bytes: Buffer;
  mime: string;
  /** Qué se hizo, para poder contarlo en los registros. */
  original: number;
  final: number;
}

/**
 * Devuelve la versión optimizada, o la original si no aplica o si falla.
 *
 * NUNCA lanza: una imagen que no se puede optimizar se guarda tal cual. Perder
 * la subida por no poder encogerla sería cambiar un problema de peso por uno
 * de pérdida de datos.
 */
export async function optimizarImagen(bytes: Buffer, mime: string): Promise<ImagenOptimizada> {
  const original = bytes.length;
  if (!OPTIMIZABLES.has(mime)) return { bytes, mime, original, final: original };

  try {
    // `animated: false` y la lista de formatos de entrada acotada dejan fuera
    // el decodificador de AVIF/HEIF (libheif), que es de donde salió el aviso
    // GHSA-2xp9-vwfh-vxw4. Aquí solo entran jpeg/png/webp.
    const img = sharp(bytes, { failOn: "error", animated: false });
    const meta = await img.metadata();
    if (meta.format !== "jpeg" && meta.format !== "png" && meta.format !== "webp") {
      // El MIME declarado no coincide con el contenido real: no lo tocamos.
      return { bytes, mime, original, final: original };
    }

    const salida = await img
      .rotate() // respeta la orientación EXIF antes de redimensionar
      .resize({
        width: LADO_MAXIMO,
        height: LADO_MAXIMO,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: CALIDAD, effort: 4 })
      .toBuffer();

    // Si el "optimizado" pesa más (pasa con PNG diminutos ya comprimidos), se
    // queda el original: el objetivo es que pese menos, no cambiar de formato.
    if (salida.length >= original) return { bytes, mime, original, final: original };

    return { bytes: salida, mime: "image/webp", original, final: salida.length };
  } catch (error) {
    logger.warn("No se pudo optimizar la imagen; se guarda el original", {
      mime,
      bytes: original,
      error: String(error),
    });
    return { bytes, mime, original, final: original };
  }
}
