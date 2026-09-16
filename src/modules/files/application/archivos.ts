import { randomUUID } from "node:crypto";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";
import { getStorage } from "../infrastructure/local-storage";
import { optimizarImagen } from "../infrastructure/optimizar-imagen";

/**
 * Tipos permitidos: materiales, documentos de contrato y el AUDIO del libro
 * interactivo (la narración de cada página, que sustituye a los globos de
 * diálogo del impreso).
 *
 * El VIDEO se queda FUERA a propósito: los del libro llegan a 47 MB, muy por
 * encima del tope de 10 MB, y servir eso por una ruta autenticada de Node es
 * trabajo de un CDN, no de este módulo. Los videos se siguen enlazando.
 */
const MIME_PERMITIDOS = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  // Safari y varias grabadoras etiquetan el m4a con este tipo antiguo.
  ["audio/x-m4a", "m4a"],
]);

export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ArchivoMeta {
  id: string;
  nombreOriginal: string;
  mime: string;
  sizeBytes: number;
  entidad: string | null;
  entidadId: string | null;
  createdAt: Date;
}

export async function subirArchivo(input: {
  actorUserId: string;
  nombreOriginal: string;
  mime: string;
  bytes: Buffer;
  entidad?: string | null;
  entidadId?: string | null;
}): Promise<{ id: string }> {
  const extension = MIME_PERMITIDOS.get(input.mime);
  if (extension === undefined) {
    throw new ValidationError(
      `Tipo de archivo no permitido (${input.mime}). Aceptados: PDF, JPG, PNG, WebP, MP3, M4A.`,
    );
  }
  if (input.bytes.length === 0 || input.bytes.length > TAMANO_MAXIMO_BYTES) {
    throw new ValidationError("El archivo debe pesar entre 1 byte y 10 MB.");
  }

  // Las imágenes se encogen ANTES de guardarse: es el único punto por el que
  // entran archivos, así que optimizar aquí cubre arte, fotos y avisos de una
  // vez. Lo que no sea imagen (PDF, audio) pasa intacto. El tope de 10 MB se
  // mide sobre lo que SUBE el usuario, no sobre lo que acaba en disco: quien
  // manda 12 MB sigue viendo el mismo error de siempre.
  const opt = await optimizarImagen(input.bytes, input.mime);
  const bytes = opt.bytes;
  const mime = opt.mime;
  const extensionFinal = MIME_PERMITIDOS.get(mime) ?? extension;
  if (opt.final < opt.original) {
    logger.info("Imagen optimizada al subirla", {
      de: input.mime,
      a: mime,
      originalBytes: opt.original,
      finalBytes: opt.final,
      ahorroPct: Math.round((1 - opt.final / opt.original) * 100),
    });
  }

  // Nombre interno NO predecible (ADR-0006).
  const id = randomUUID();
  const storageKey = `${randomUUID()}.${extensionFinal}`;

  await getStorage().guardar(storageKey, bytes, mime);
  await execute(
    `INSERT INTO files_object
       (id, nombre_original, mime, size_bytes, storage_key, subido_por, entidad, entidad_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.nombreOriginal.slice(0, 200),
      mime,
      bytes.length,
      storageKey,
      input.actorUserId,
      input.entidad ?? null,
      input.entidadId ?? null,
    ],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "files.subido",
    entidad: "files_object",
    entidadId: id,
    payload: { nombre: input.nombreOriginal, mime: input.mime, bytes: input.bytes.length },
  });
  return { id };
}

/** Descarga AUTENTICADA (no hay URLs públicas — datos de menores). */
export async function descargarArchivo(id: string): Promise<{
  meta: { nombreOriginal: string; mime: string };
  bytes: Buffer;
}> {
  const meta = await queryOne<{ nombre_original: string; mime: string; storage_key: string }>(
    `SELECT nombre_original, mime, storage_key FROM files_object WHERE id = $1`,
    [id],
  );
  if (meta === null) throw new NotFoundError("El archivo no existe.");
  const bytes = await getStorage().leer(meta.storage_key);
  return { meta: { nombreOriginal: meta.nombre_original, mime: meta.mime }, bytes };
}

/**
 * Borra un archivo: la fila y sus bytes.
 *
 * Existe para quien REEMPLAZA: `subirArchivo` siempre crea uno nuevo, así que
 * reimportar un cuadernillo dejaba el anterior huérfano ocupando disco. Quien
 * repunta a un archivo nuevo es responsable de soltar el viejo.
 *
 * Borrar un archivo que ya no está NO es un error: el objetivo es que deje de
 * existir, y reintentar una limpieza a medias tiene que poder completarse.
 */
export async function eliminarArchivo(id: string): Promise<void> {
  const meta = await queryOne<{ storage_key: string }>(
    `SELECT storage_key FROM files_object WHERE id = $1`,
    [id],
  );
  if (meta === null) return;
  await execute(`DELETE FROM files_object WHERE id = $1`, [id]);
  try {
    await getStorage().eliminar(meta.storage_key);
  } catch (error) {
    // La fila ya no está: dejar los bytes sueltos es desperdicio, no corrupción.
    logger.warn("No se pudieron borrar los bytes del archivo", { id, error: String(error) });
  }
}

export async function listarArchivos(params: {
  entidad?: string;
  entidadId?: string;
  limit?: number;
}): Promise<ArchivoMeta[]> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (params.entidad !== undefined) {
    values.push(params.entidad);
    where.push(`entidad = $${values.length}`);
  }
  if (params.entidadId !== undefined) {
    values.push(params.entidadId);
    where.push(`entidad_id = $${values.length}`);
  }
  values.push(Math.min(params.limit ?? 50, 200));
  return queryRows<ArchivoMeta>(
    `SELECT id, nombre_original AS "nombreOriginal", mime, size_bytes AS "sizeBytes",
            entidad, entidad_id AS "entidadId", created_at AS "createdAt"
       FROM files_object
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${values.length}`,
    values,
  );
}
