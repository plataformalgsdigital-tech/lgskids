import { execute, queryRows } from "@/platform/db/query";
import { getStorage } from "../infrastructure/local-storage";
import { optimizarImagen } from "../infrastructure/optimizar-imagen";

/**
 * Reencoda las imágenes YA guardadas, las que entraron antes de que se
 * optimizara al subir.
 *
 * Reescribe el MISMO archivo (mismo id, misma clave): las URLs ya están
 * repartidas por los paneles y los hotspots cuelgan de ellas. Cambiar el id
 * rompería lo que hoy funciona.
 *
 * Cada imagen va por su cuenta: si una falla se deja intacta y se sigue. Una
 * imagen sin optimizar es un problema de peso; un archivo a medio escribir es
 * un problema de pérdida.
 */

/** Por debajo de esto no vale la pena tocar nada (el VoBo son 44 kB). */
export const UMBRAL_REOPTIMIZAR = 120 * 1024;

export interface ResultadoReoptimizar {
  id: string;
  entidad: string | null;
  original: number;
  final: number;
  estado: "optimizada" | "ya-optima" | "error";
  error?: string;
}

interface Fila {
  id: string;
  storage_key: string;
  mime: string;
  entidad: string | null;
}

export async function reoptimizarImagenes(opciones: {
  /** Sin esto NO se escribe nada: solo informa qué pasaría. */
  aplicar: boolean;
  umbralBytes?: number;
}): Promise<ResultadoReoptimizar[]> {
  const umbral = opciones.umbralBytes ?? UMBRAL_REOPTIMIZAR;
  const filas = await queryRows<Fila>(
    `SELECT id, storage_key, mime, entidad
       FROM files_object
      WHERE mime IN ('image/jpeg','image/png','image/webp')
        AND size_bytes > $1
      ORDER BY size_bytes DESC`,
    [umbral],
  );

  const storage = getStorage();
  const salida: ResultadoReoptimizar[] = [];

  for (const f of filas) {
    try {
      const bytes = await storage.leer(f.storage_key);
      const opt = await optimizarImagen(bytes, f.mime);

      if (opt.final >= opt.original) {
        salida.push({
          id: f.id,
          entidad: f.entidad,
          original: opt.original,
          final: opt.final,
          estado: "ya-optima",
        });
        continue;
      }

      if (opciones.aplicar) {
        // Misma clave: la URL no cambia. El MIME sí, porque ahora es WebP.
        await storage.guardar(f.storage_key, opt.bytes, opt.mime);
        await execute(`UPDATE files_object SET mime = $2, size_bytes = $3 WHERE id = $1`, [
          f.id,
          opt.mime,
          opt.bytes.length,
        ]);
      }
      salida.push({
        id: f.id,
        entidad: f.entidad,
        original: opt.original,
        final: opt.final,
        estado: "optimizada",
      });
    } catch (error) {
      salida.push({
        id: f.id,
        entidad: f.entidad,
        original: 0,
        final: 0,
        estado: "error",
        error: String(error),
      });
    }
  }

  return salida;
}
