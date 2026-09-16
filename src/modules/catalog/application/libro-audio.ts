import { eliminarArchivo } from "@/modules/files";
import { queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { newId } from "@/platform/ids";
import { NotFoundError, ValidationError } from "@/platform/errors";

/**
 * AUDIO del cuadernillo: la narración que sustituye a los globos del impreso.
 *
 * La llave es el PLIEGO, no la página, porque es la única que el material da:
 * `PAG16-07.mp3` dice "hoja 16", y esa hoja son dos páginas impresas. Ver la
 * migración `20260915000000_libro_audio`.
 *
 * El VIDEO no entra aquí: los del cuadernillo llegan a 47 MB, muy por encima
 * del tope de `files`, y servirlos por una ruta autenticada de Node es trabajo
 * de un CDN. Se siguen enlazando.
 */

export interface PistaLibro {
  id: string;
  pliego: number;
  orden: number;
  nombreOriginal: string;
  /** Qué elemento narra, cuando alguien lo haya asignado. */
  elementoId: string | null;
  /** Se sirve por la misma ruta autenticada que el resto del material. */
  url: string;
}

interface FilaPista {
  id: string;
  pliego: number;
  orden: number;
  nombre_original: string;
  elemento_id: string | null;
  file_id: string;
}

function aPista(f: FilaPista): PistaLibro {
  return {
    id: f.id,
    pliego: f.pliego,
    orden: f.orden,
    nombreOriginal: f.nombre_original,
    elementoId: f.elemento_id,
    url: `/api/catalog/libro-audio/${f.file_id}`,
  };
}

/** Todas las pistas de un libro, agrupables por pliego. */
export async function audiosDeLibro(libroId: string): Promise<PistaLibro[]> {
  const filas = await queryRows<FilaPista>(
    `SELECT id, pliego, orden, nombre_original, elemento_id, file_id
       FROM catalog_libro_audio
      WHERE libro_id = $1
      ORDER BY pliego, orden`,
    [libroId],
  );
  return filas.map(aPista);
}

/**
 * Registra una pista ya subida a `files`.
 *
 * Reemplaza la que ocupara ese (pliego, orden): reejecutar el importador no
 * debe duplicar, y la pista vigente es siempre la última subida.
 */
export async function registrarAudioLibro(input: {
  libroId: string;
  pliego: number;
  orden: number;
  fileId: string;
  nombreOriginal: string;
}): Promise<{ id: string }> {
  if (!Number.isInteger(input.pliego) || input.pliego < 1) {
    throw new ValidationError(`Pliego inválido: ${String(input.pliego)}.`);
  }
  if (!Number.isInteger(input.orden) || input.orden < 1) {
    throw new ValidationError(`Orden inválido: ${String(input.orden)}.`);
  }

  const { id, anterior } = await withTransaction(async (client) => {
    // Qué archivo ocupaba este hueco ANTES, para no dejarlo huérfano: subir
    // siempre crea uno nuevo, así que reimportar duplicaba los bytes en disco.
    const previo = await client.query<{ file_id: string }>(
      `SELECT file_id FROM catalog_libro_audio
        WHERE libro_id = $1 AND pliego = $2 AND orden = $3`,
      [input.libroId, input.pliego, input.orden],
    );
    const nuevo = newId();
    const r = await client.query<{ id: string }>(
      `INSERT INTO catalog_libro_audio
         (id, libro_id, pliego, orden, file_id, nombre_original)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (libro_id, pliego, orden) DO UPDATE
         SET file_id = EXCLUDED.file_id,
             nombre_original = EXCLUDED.nombre_original
       RETURNING id`,
      [
        nuevo,
        input.libroId,
        input.pliego,
        input.orden,
        input.fileId,
        input.nombreOriginal.slice(0, 200),
      ],
    );
    const viejo = previo.rows[0]?.file_id;
    return {
      id: r.rows[0]?.id ?? nuevo,
      anterior: viejo !== undefined && viejo !== input.fileId ? viejo : null,
    };
  });

  // FUERA de la transacción: borrar bytes no se puede deshacer, así que solo
  // se hace cuando el cambio de puntero ya está confirmado.
  if (anterior !== null) await eliminarArchivo(anterior);
  return { id };
}

/** id del libro por su clave natural, para los scripts. */
export async function libroIdPorCodigo(
  curso: string,
  nivel: string,
  codigo: string,
): Promise<string> {
  const filas = await queryRows<{ id: string }>(
    `SELECT id FROM catalog_libro
      WHERE curso = $1::catalog_course_tipo AND nivel = $2 AND codigo = $3`,
    [curso, nivel, codigo],
  );
  const id = filas[0]?.id;
  if (id === undefined) throw new NotFoundError(`No hay libro ${curso}·${nivel}·${codigo}.`);
  return id;
}

/** Comprueba que un archivo es de este libro antes de servirlo. */
export async function audioPerteneceALibro(fileId: string): Promise<boolean> {
  const filas = await queryRows<{ n: string }>(
    `SELECT COUNT(*)::text n FROM catalog_libro_audio WHERE file_id = $1`,
    [fileId],
  );
  return filas[0]?.n !== "0";
}
