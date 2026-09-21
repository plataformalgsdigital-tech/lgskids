import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registrarAuditoria } from "@/modules/audit";
import { eliminarArchivo, metaArchivo, subirArchivo, type PoliticaArchivo } from "@/modules/files";
import { requireAuthSecret } from "@/platform/config/env";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";
import {
  DURACION_MAXIMA_VIDEO_SEG,
  MINUTOS_MAX_PROCESANDO,
  TAMANO_MAXIMO_VIDEO_FINAL,
  TAMANO_MAXIMO_VIDEO_SUBIDA,
  VIGENCIA_TOKEN_VIDEOS_SEG,
  casillaValida,
  firmarTokenVideos,
  rutaVideoLibro,
  tokenVideosValido,
  type EstadoVideo,
} from "../domain/video-libro";
import { comprimirVideo } from "../infrastructure/comprimir-video";
import { claveMaterial } from "./material";

/**
 * Videos del libro interactivo: se suben aparte, se comprimen, se revisan y se
 * publican. El libro los pide por `videos/<página>-<n>.mp4` (ver el dominio).
 *
 * Ciclo: PROCESANDO → BORRADOR → PUBLICADO (o ERROR). Comprimir tarda (una
 * canción de 3 minutos a 720p, decenas de segundos), así que la subida responde
 * de inmediato y la compresión sigue después; la pantalla consulta el estado.
 */

export interface VideoLibro {
  id: string;
  curso: string;
  nivel: string;
  pagina: number;
  orden: number;
  estado: EstadoVideo;
  nombreOriginal: string;
  bytesOriginal: number;
  bytesFinal: number | null;
  duracionSeg: number | null;
  ancho: number | null;
  alto: number | null;
  error: string | null;
  creadoEn: Date;
  publicadoEn: Date | null;
  /** Lo que diseño escribe en el libro: `videos/7-1.mp4`. */
  ruta: string;
}

const ENTIDAD_ARCHIVO = "catalog_material_video";

const POLITICA_VIDEO: PoliticaArchivo = {
  mimes: new Map([["video/mp4", "mp4"]]),
  tamanoMaximo: TAMANO_MAXIMO_VIDEO_FINAL,
};

/** Formatos que el equipo puede subir; ffmpeg los convierte todos a mp4. */
const EXTENSIONES = new Set(["mp4", "m4v", "mov", "webm", "mkv", "avi"]);

const COLUMNAS = `id, curso, nivel, pagina, orden, estado, nombre_original AS "nombreOriginal",
  bytes_original::float8 AS "bytesOriginal", bytes_final::float8 AS "bytesFinal",
  duracion_seg::float8 AS "duracionSeg", ancho, alto, error,
  creado_en AS "creadoEn", publicado_en AS "publicadoEn"`;

type FilaVideo = Omit<VideoLibro, "ruta">;
const conRuta = (f: FilaVideo): VideoLibro => ({ ...f, ruta: rutaVideoLibro(f.pagina, f.orden) });

const rutaTemporal = (id: string, sufijo: string) => join(tmpdir(), `kids-video-${id}${sufijo}`);

/**
 * Registra la subida: guarda el original en un temporal y crea la fila en
 * PROCESANDO. La compresión la hace `procesarVideoLibro`, que quien llama
 * lanza DESPUÉS de responder (la ruta usa `after()` de Next).
 */
export async function registrarVideoSubido(input: {
  actorUserId: string;
  curso: string;
  nivel: string;
  pagina: number;
  orden: number;
  nombreOriginal: string;
  bytes: Buffer;
}): Promise<{ id: string; temporal: string }> {
  claveMaterial(input.curso, input.nivel);
  if (!casillaValida(input.pagina, input.orden)) {
    throw new ValidationError(
      "Página (1 a 999, la que se ve en el libro) o número de video en la página (1 a 9) inválidos.",
    );
  }
  const extension = input.nombreOriginal.toLowerCase().split(".").pop() ?? "";
  if (!EXTENSIONES.has(extension)) {
    throw new ValidationError("Sube un video (.mp4, .mov, .m4v, .webm, .mkv o .avi).");
  }
  if (input.bytes.length === 0 || input.bytes.length > TAMANO_MAXIMO_VIDEO_SUBIDA) {
    throw new ValidationError(
      `El video debe pesar entre 1 byte y ${String(TAMANO_MAXIMO_VIDEO_SUBIDA / 1024 / 1024)} MB.`,
    );
  }

  const id = randomUUID();
  const temporal = rutaTemporal(id, `.${extension}`);
  await writeFile(temporal, input.bytes);
  await execute(
    `INSERT INTO catalog_material_video
       (id, curso, nivel, pagina, orden, estado, nombre_original, bytes_original, subido_por)
     VALUES ($1, $2, $3, $4, $5, 'PROCESANDO', $6, $7, $8)`,
    [
      id,
      input.curso,
      input.nivel,
      input.pagina,
      input.orden,
      input.nombreOriginal.slice(0, 200),
      input.bytes.length,
      input.actorUserId,
    ],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.video_libro.subido",
    entidad: "catalog_material_video",
    entidadId: id,
    payload: {
      curso: input.curso,
      nivel: input.nivel,
      ruta: rutaVideoLibro(input.pagina, input.orden),
      nombre: input.nombreOriginal,
      bytes: input.bytes.length,
    },
  });
  return { id, temporal };
}

/**
 * De a UNO: ffmpeg usa todos los núcleos, y dos compresiones a la vez hacen que
 * la plataforma entera responda lento para los niños que están en clase.
 */
let cola: Promise<unknown> = Promise.resolve();

export function procesarVideoLibro(id: string, temporal: string): Promise<void> {
  const turno = cola.then(() => comprimirYGuardar(id, temporal));
  cola = turno.catch(() => undefined);
  return turno;
}

async function comprimirYGuardar(id: string, temporal: string): Promise<void> {
  const salida = rutaTemporal(id, ".salida.mp4");
  try {
    // Al tomar el turno se renueva `actualizado_en`: el plazo de "se interrumpió"
    // cuenta desde que EMPIEZA a comprimir, no desde que entró a la cola.
    const fila = await queryOne<{ subidoPor: string; pagina: number; orden: number }>(
      `UPDATE catalog_material_video SET actualizado_en = now()
        WHERE id = $1 AND estado = 'PROCESANDO'
        RETURNING subido_por AS "subidoPor", pagina, orden`,
      [id],
    );
    if (fila === null) return; // lo borraron mientras esperaba turno

    const r = await comprimirVideo(temporal, salida, DURACION_MAXIMA_VIDEO_SEG);
    const { id: fileId } = await subirArchivo({
      actorUserId: fila.subidoPor,
      nombreOriginal: `${String(fila.pagina)}-${String(fila.orden)}.mp4`,
      mime: "video/mp4",
      bytes: await readFile(salida),
      entidad: ENTIDAD_ARCHIVO,
      entidadId: id,
      politica: POLITICA_VIDEO,
    });
    const n = await execute(
      `UPDATE catalog_material_video
          SET estado = 'BORRADOR', file_id = $2, bytes_final = $3, duracion_seg = $4,
              ancho = $5, alto = $6, actualizado_en = now()
        WHERE id = $1 AND estado = 'PROCESANDO'`,
      [id, fileId, r.bytes, r.duracionSeg, r.ancho, r.alto],
    );
    // La fila desapareció mientras se comprimía: el archivo nuevo no es de nadie.
    if (n === 0) await eliminarArchivo(fileId);
    logger.info("Video del libro comprimido", {
      id,
      estrategia: r.estrategia,
      bytesFinal: r.bytes,
      duracionSeg: Math.round(r.duracionSeg),
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    logger.warn("No se pudo comprimir un video del libro", { id, error: mensaje });
    await execute(
      `UPDATE catalog_material_video SET estado = 'ERROR', error = $2, actualizado_en = now()
        WHERE id = $1 AND estado = 'PROCESANDO'`,
      [id, mensaje.slice(0, 500)],
    );
  } finally {
    await rm(temporal, { force: true });
    await rm(salida, { force: true });
  }
}

/** Todos los videos de un nivel, por página y número; lo publicado primero. */
export async function listarVideosLibro(curso: string, nivel: string): Promise<VideoLibro[]> {
  claveMaterial(curso, nivel);
  // Lo que lleva demasiado "procesando" ya no va a terminar: el servidor se
  // reinició a medio comprimir. Se marca para que el equipo lo vuelva a subir.
  await execute(
    `UPDATE catalog_material_video
        SET estado = 'ERROR', actualizado_en = now(),
            error = 'La compresión se interrumpió (el servidor se reinició). Vuelve a subirlo.'
      WHERE estado = 'PROCESANDO' AND actualizado_en < now() - make_interval(mins => $1)`,
    [MINUTOS_MAX_PROCESANDO],
  );
  const filas = await queryRows<FilaVideo>(
    `SELECT ${COLUMNAS} FROM catalog_material_video
      WHERE curso = $1 AND nivel = $2
      ORDER BY pagina, orden, (estado = 'PUBLICADO') DESC, creado_en DESC`,
    [curso, nivel],
  );
  return filas.map(conRuta);
}

/**
 * Publica un BORRADOR. Si la casilla ya tenía un video publicado, lo
 * REEMPLAZA: en la misma transacción se borra la fila vieja y se publica la
 * nueva, así el niño nunca ve la casilla vacía ni dos videos a la vez. El
 * archivo viejo se suelta después: borrar bytes no se deshace.
 */
export async function confirmarVideoLibro(input: {
  actorUserId: string;
  id: string;
}): Promise<{ reemplazado: boolean }> {
  const { viejo, fila } = await withTransaction(async (client) => {
    const fila = await queryOne<{
      estado: EstadoVideo;
      curso: string;
      nivel: string;
      pagina: number;
      orden: number;
    }>(
      `SELECT estado, curso, nivel, pagina, orden FROM catalog_material_video
        WHERE id = $1 FOR UPDATE`,
      [input.id],
      client,
    );
    if (fila === null) throw new NotFoundError("El video no existe.");
    if (fila.estado !== "BORRADOR") {
      throw new ConflictError(
        fila.estado === "PUBLICADO"
          ? "Ese video ya está publicado."
          : "Solo se publica un video ya comprimido y revisado.",
      );
    }
    const viejo = await queryOne<{ id: string; fileId: string | null }>(
      `SELECT id, file_id AS "fileId" FROM catalog_material_video
        WHERE curso = $1 AND nivel = $2 AND pagina = $3 AND orden = $4 AND estado = 'PUBLICADO'
        FOR UPDATE`,
      [fila.curso, fila.nivel, fila.pagina, fila.orden],
      client,
    );
    if (viejo !== null) {
      await execute(`DELETE FROM catalog_material_video WHERE id = $1`, [viejo.id], client);
    }
    await execute(
      `UPDATE catalog_material_video
          SET estado = 'PUBLICADO', publicado_en = now(), actualizado_en = now()
        WHERE id = $1`,
      [input.id],
      client,
    );
    return { viejo, fila };
  });
  if (viejo?.fileId) await eliminarArchivo(viejo.fileId);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.video_libro.publicado",
    entidad: "catalog_material_video",
    entidadId: input.id,
    payload: {
      curso: fila.curso,
      nivel: fila.nivel,
      ruta: rutaVideoLibro(fila.pagina, fila.orden),
      reemplazo: viejo?.id ?? null,
    },
  });
  return { reemplazado: viejo !== null };
}

/** Borra un video en cualquier estado: la fila y su archivo. */
export async function eliminarVideoLibro(input: {
  actorUserId: string;
  id: string;
}): Promise<void> {
  const fila = await queryOne<{ fileId: string | null; ruta: string; estado: EstadoVideo }>(
    `DELETE FROM catalog_material_video WHERE id = $1
      RETURNING file_id AS "fileId", estado, curso || ':' || nivel || ':' || pagina || '-' || orden AS ruta`,
    [input.id],
  );
  if (fila === null) throw new NotFoundError("El video no existe.");
  if (fila.fileId !== null) await eliminarArchivo(fila.fileId);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.video_libro.eliminado",
    entidad: "catalog_material_video",
    entidadId: input.id,
    payload: { casilla: fila.ruta, estado: fila.estado },
  });
}

/** El archivo del video PUBLICADO en una casilla, o null. Es lo que ve el niño. */
export async function archivoVideoPublicado(
  curso: string,
  nivel: string,
  pagina: number,
  orden: number,
): Promise<string | null> {
  const f = await queryOne<{ fileId: string | null }>(
    `SELECT file_id AS "fileId" FROM catalog_material_video
      WHERE curso = $1 AND nivel = $2 AND pagina = $3 AND orden = $4 AND estado = 'PUBLICADO'`,
    [curso, nivel, pagina, orden],
  );
  return f?.fileId ?? null;
}

/** El archivo de un video por su id, en cualquier estado: el previo del equipo. */
export async function archivoDeVideoLibro(id: string): Promise<string | null> {
  const f = await queryOne<{ fileId: string | null }>(
    `SELECT file_id AS "fileId" FROM catalog_material_video WHERE id = $1`,
    [id],
  );
  if (f?.fileId == null) return null;
  // El archivo existe de verdad (nadie lo borró a mano).
  return (await metaArchivo(f.fileId)) === null ? null : f.fileId;
}

// —— Token para el libro ————————————————————————————————————————————————

const ahoraSeg = () => Math.floor(Date.now() / 1000);

/**
 * La BASE que el panel entrega al libro para sus videos:
 * `/api/material/<id>/t/<token>/`. Con ella, la ruta relativa `videos/7-1.mp4`
 * del libro llega autorizada sin cookie.
 */
export function baseVideosLibro(materialId: string): string {
  const token = firmarTokenVideos(
    materialId,
    ahoraSeg() + VIGENCIA_TOKEN_VIDEOS_SEG,
    requireAuthSecret(),
  );
  return `/api/material/${materialId}/t/${token}/`;
}

export function tokenVideosLibroValido(materialId: string, token: string): boolean {
  return tokenVideosValido(materialId, token, requireAuthSecret(), ahoraSeg());
}
