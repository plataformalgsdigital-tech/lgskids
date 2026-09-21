import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { metaArchivo } from "@/modules/files";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryRows } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import {
  archivoVideoPublicado,
  baseVideosLibro,
  confirmarVideoLibro,
  eliminarVideoLibro,
  listarVideosLibro,
  procesarVideoLibro,
  registrarVideoSubido,
  tokenVideosLibroValido,
} from "../application/video-libro";

const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
// Un nivel y páginas que el material real no usa: la prueba no toca nada vivo.
const CURSO = "YOUNGSTER";
const NIVEL = "ULTIMATE";
const PAGINA = 900 + Math.floor(Math.random() * 90);

/** Genera un clip de prueba con el ffmpeg del proyecto. */
function clip(nombre: string, args: string[]): Buffer {
  const ruta = join(tmpdir(), `kids-prueba-${randomUUID()}-${nombre}`);
  const r = spawnSync(ffmpegStatic as string, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...args,
    ruta,
  ]);
  if (r.status !== 0) throw new Error(`no se pudo generar ${nombre}: ${String(r.stderr)}`);
  const bytes = readFileSync(ruta);
  rmSync(ruta, { force: true });
  return bytes;
}

async function subirYProcesar(bytes: Buffer, nombre: string, orden = 1) {
  const { id, temporal } = await registrarVideoSubido({
    actorUserId: ACTOR,
    curso: CURSO,
    nivel: NIVEL,
    pagina: PAGINA,
    orden,
    nombreOriginal: nombre,
    bytes,
  });
  await procesarVideoLibro(id, temporal);
  const v = (await listarVideosLibro(CURSO, NIVEL)).find((x) => x.id === id);
  if (v === undefined) throw new Error("el video desapareció");
  return v;
}

describe.runIf(RUN)("videos del libro (integración, con ffmpeg real)", () => {
  // 720p, 3 s, tono de audio: lo que diseño tenía incrustado (a escala).
  let grande: Buffer;
  // 180p ya muy comprimido: recodificarlo lo AGRANDARÍA.
  let chico: Buffer;

  beforeAll(() => {
    grande = clip("720p.mp4", [
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=25:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
    ]);
    chico = clip("180p.mp4", [
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=15:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-c:v",
      "libx264",
      "-crf",
      "45",
      "-c:a",
      "aac",
      "-b:a",
      "32k",
      "-shortest",
    ]);
  }, 60_000);

  afterAll(async () => {
    const restos = await queryRows<{ id: string }>(
      `SELECT id FROM catalog_material_video WHERE curso = $1 AND nivel = $2 AND pagina >= 900`,
      [CURSO, NIVEL],
    );
    for (const r of restos) await eliminarVideoLibro({ actorUserId: ACTOR, id: r.id });
    await closePool();
  });

  it("comprime al subir: 720p → 360p, H.264, y queda POR REVISAR (no publicado)", async () => {
    const v = await subirYProcesar(grande, "prueba-720p.mp4");
    expect(v.estado).toBe("BORRADOR");
    expect(v.alto).toBe(360);
    expect(v.bytesFinal).not.toBeNull();
    expect(v.ruta).toBe(`videos/${String(PAGINA)}-1.mp4`);
    // Un borrador NO se sirve al niño.
    expect(await archivoVideoPublicado(CURSO, NIVEL, PAGINA, 1)).toBeNull();
  }, 60_000);

  it("confirmar lo publica; publicar dos veces el mismo es un conflicto", async () => {
    const [borrador] = (await listarVideosLibro(CURSO, NIVEL)).filter(
      (v) => v.pagina === PAGINA && v.estado === "BORRADOR",
    );
    if (borrador === undefined) throw new Error("falta el borrador");
    expect(await confirmarVideoLibro({ actorUserId: ACTOR, id: borrador.id })).toEqual({
      reemplazado: false,
    });
    expect(await archivoVideoPublicado(CURSO, NIVEL, PAGINA, 1)).not.toBeNull();
    await expect(
      confirmarVideoLibro({ actorUserId: ACTOR, id: borrador.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("REEMPLAZAR: el nuevo toma la casilla y el viejo se va con su archivo", async () => {
    const viejoFile = await archivoVideoPublicado(CURSO, NIVEL, PAGINA, 1);
    const nuevo = await subirYProcesar(grande, "prueba-720p-v2.mp4");
    expect(await confirmarVideoLibro({ actorUserId: ACTOR, id: nuevo.id })).toEqual({
      reemplazado: true,
    });
    const publicados = (await listarVideosLibro(CURSO, NIVEL)).filter(
      (v) => v.pagina === PAGINA && v.orden === 1 && v.estado === "PUBLICADO",
    );
    expect(publicados.map((v) => v.id)).toEqual([nuevo.id]);
    expect(await metaArchivo(viejoFile ?? "")).toBeNull();
  }, 60_000);

  it("NUNCA agranda: un video ya muy comprimido se queda como vino", async () => {
    const v = await subirYProcesar(chico, "prueba-180p.mp4", 2);
    expect(v.estado).toBe("BORRADOR");
    expect(v.bytesFinal ?? Infinity).toBeLessThanOrEqual(v.bytesOriginal);
  }, 60_000);

  it("un archivo que no es video termina en ERROR con un motivo legible", async () => {
    const v = await subirYProcesar(Buffer.from("esto no es un video"), "falso.mp4", 3);
    expect(v.estado).toBe("ERROR");
    expect(v.error).toMatch(/video/i);
  }, 60_000);

  it("rechaza al subir lo que no es una casilla, un nivel o un formato válidos", async () => {
    const base = {
      actorUserId: ACTOR,
      curso: CURSO,
      nivel: NIVEL,
      pagina: PAGINA,
      orden: 1,
      nombreOriginal: "x.mp4",
      bytes: grande,
    };
    await expect(registrarVideoSubido({ ...base, orden: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(registrarVideoSubido({ ...base, pagina: 1000 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(registrarVideoSubido({ ...base, nivel: "TODOS" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(registrarVideoSubido({ ...base, nombreOriginal: "x.exe" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("lo que quedó 'comprimiendo' tras un reinicio se marca como error al listar", async () => {
    const id = randomUUID();
    await execute(
      `INSERT INTO catalog_material_video
         (id, curso, nivel, pagina, orden, estado, nombre_original, bytes_original, subido_por,
          actualizado_en)
       VALUES ($1, $2, $3, $4, 9, 'PROCESANDO', 'colgado.mp4', 1, $5, now() - interval '1 hour')`,
      [id, CURSO, NIVEL, PAGINA, ACTOR],
    );
    const v = (await listarVideosLibro(CURSO, NIVEL)).find((x) => x.id === id);
    expect(v?.estado).toBe("ERROR");
    expect(v?.error).toMatch(/interrumpió/);
  });

  // Como la prueba de sesión de `identity`: firma con AUTH_JWT_SECRET, que CI
  // define y en local puede no estar.
  it.runIf(env().AUTH_JWT_SECRET !== undefined)("el token sirve para ESE libro y no otro", () => {
    const libro = randomUUID();
    const base = baseVideosLibro(libro);
    const m = /^\/api\/material\/([^/]+)\/t\/([^/]+)\/$/.exec(base);
    expect(m?.[1]).toBe(libro);
    expect(tokenVideosLibroValido(libro, m?.[2] ?? "")).toBe(true);
    expect(tokenVideosLibroValido(randomUUID(), m?.[2] ?? "")).toBe(false);
  });
});
