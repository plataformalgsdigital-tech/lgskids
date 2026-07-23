import { randomUUID } from "node:crypto";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { getStorage } from "../infrastructure/local-storage";

/** Tipos permitidos: materiales y documentos de contrato. */
const MIME_PERMITIDOS = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
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
      `Tipo de archivo no permitido (${input.mime}). Aceptados: PDF, JPG, PNG, WebP.`,
    );
  }
  if (input.bytes.length === 0 || input.bytes.length > TAMANO_MAXIMO_BYTES) {
    throw new ValidationError("El archivo debe pesar entre 1 byte y 10 MB.");
  }

  // Nombre interno NO predecible (ADR-0006).
  const id = randomUUID();
  const storageKey = `${randomUUID()}.${extension}`;

  await getStorage().guardar(storageKey, input.bytes, input.mime);
  await execute(
    `INSERT INTO files_object
       (id, nombre_original, mime, size_bytes, storage_key, subido_por, entidad, entidad_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.nombreOriginal.slice(0, 200),
      input.mime,
      input.bytes.length,
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
