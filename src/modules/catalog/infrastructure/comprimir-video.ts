import { spawn } from "node:child_process";
import { rename, rm, stat } from "node:fs/promises";
import ffmpegStatic from "ffmpeg-static";

/**
 * Compresión de los videos del libro con ffmpeg (el binario de `ffmpeg-static`,
 * que se descarga para la plataforma al instalar: Windows en desarrollo, Linux
 * en el servidor).
 *
 * La receta es la que ya usa diseño en el libro CON_PASSPORT y la que se validó
 * a ojo contra el original (2026-09-19): 360p, H.264 Main (lo reproduce
 * cualquier tableta, iPad incluido), CRF 28 con techo de 400 kb/s, AAC 64 kb/s
 * estéreo y `faststart` para que empiece a sonar antes de bajarse entero. Los 5
 * videos de 720p del libro de Rookie pasaron de 63,2 a 22,1 MB sin diferencia
 * visible en pantalla.
 */

export interface InfoVideo {
  duracionSeg: number;
  ancho: number;
  alto: number;
  codecVideo: string;
  codecAudio: string | null;
}

export interface ResultadoCompresion extends InfoVideo {
  bytes: number;
  /** "recomprimido", o "original" si comprimir lo agrandaba (ver abajo). */
  estrategia: "recomprimido" | "original";
}

const TIEMPO_MAXIMO_MS = 10 * 60 * 1000;

function binario(): string {
  if (typeof ffmpegStatic !== "string" || ffmpegStatic === "") {
    throw new Error("ffmpeg no está disponible en este servidor (ffmpeg-static sin binario).");
  }
  return ffmpegStatic;
}

function ejecutar(args: string[]): Promise<{ codigo: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(binario(), args, { windowsHide: true });
    let stderr = "";
    proceso.stderr.on("data", (d: Buffer) => {
      // Solo la cola: ffmpeg es verboso y lo útil para diagnosticar va al final.
      stderr = (stderr + d.toString()).slice(-20_000);
    });
    const reloj = setTimeout(() => proceso.kill("SIGKILL"), TIEMPO_MAXIMO_MS);
    proceso.on("error", (e) => {
      clearTimeout(reloj);
      reject(e);
    });
    proceso.on("close", (codigo) => {
      clearTimeout(reloj);
      resolve({ codigo, stderr });
    });
  });
}

/** Lee duración, tamaño y códecs. Lanza si el archivo no trae video. */
export async function sondearVideo(ruta: string): Promise<InfoVideo> {
  // Sin salida ffmpeg termina con código 1: lo que interesa es lo que imprime.
  const { stderr } = await ejecutar(["-hide_banner", "-i", ruta]);
  const lineaVideo = /Stream #[^\n]*Video: ([a-z0-9_]+)[^\n]*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  if (lineaVideo === null) {
    throw new Error("El archivo no contiene un video que se pueda leer.");
  }
  const d = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const duracionSeg = d === null ? 0 : Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  const audio = /Stream #[^\n]*Audio: ([a-z0-9_]+)/.exec(stderr);
  return {
    duracionSeg,
    ancho: Number(lineaVideo[2]),
    alto: Number(lineaVideo[3]),
    codecVideo: lineaVideo[1] ?? "",
    codecAudio: audio?.[1] ?? null,
  };
}

const RECETA = [
  // 360p sin agrandar lo que venga más chico; alto par (lo exige H.264 4:2:0).
  "-vf",
  "scale=-2:trunc(min(360\\,ih)/2)*2:flags=lanczos",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "28",
  "-maxrate",
  "400k",
  "-bufsize",
  "800k",
  "-profile:v",
  "main",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "64k",
  "-ac",
  "2",
  "-movflags",
  "+faststart",
  // Fuera metadatos del original (títulos, herramientas, a veces ubicación).
  "-map_metadata",
  "-1",
];

async function tamano(ruta: string): Promise<number> {
  return (await stat(ruta)).size;
}

/**
 * Por debajo de esto (video + audio) un H.264 de 360p ya está tan comprimido
 * como lo dejaría la receta. Los de CON_PASSPORT van de 110 a 190 kb/s.
 */
const KBPS_YA_LIGERO = 800;

/** Reempaqueta sin tocar la imagen: `faststart` y fuera metadatos. */
async function reempaquetar(entrada: string, salida: string): Promise<boolean> {
  const c = await ejecutar([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    entrada,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    salida,
  ]);
  return c.codigo === 0;
}

/**
 * Comprime `entrada` en `salida` (mp4).
 *
 * **Nunca agranda**: un video que ya viene bien comprimido (los de CON_PASSPORT
 * están a ~110 kb/s) CRECE al recodificarlo —se probó: +50 % a +90 %—, porque
 * la codificación por calidad conserva su ruido. Si pasa, y el original ya es
 * H.264 con AAC, se queda el original, solo reempaquetado con `faststart`.
 *
 * Y si se VE de entrada que ya es ligero (H.264/AAC, 360p o menos, bitrate
 * bajo) ni se intenta: recomprimir para descartar el resultado eran ~35 s de
 * CPU del servidor por video, medidos con los 12 de CON_PASSPORT.
 */
export async function comprimirVideo(
  entrada: string,
  salida: string,
  duracionMaximaSeg: number,
): Promise<ResultadoCompresion> {
  const info = await sondearVideo(entrada);
  if (info.duracionSeg > duracionMaximaSeg) {
    throw new Error(
      `El video dura ${String(Math.round(info.duracionSeg / 60))} min; el máximo es ${String(Math.round(duracionMaximaSeg / 60))}.`,
    );
  }
  const compatible =
    info.codecVideo === "h264" && (info.codecAudio === null || info.codecAudio === "aac");
  const kbps =
    info.duracionSeg > 0 ? ((await tamano(entrada)) * 8) / info.duracionSeg / 1000 : Infinity;
  if (compatible && info.alto <= 360 && kbps <= KBPS_YA_LIGERO) {
    if (await reempaquetar(entrada, salida)) {
      const final = await sondearVideo(salida);
      return { ...final, bytes: await tamano(salida), estrategia: "original" };
    }
  }

  const r = await ejecutar([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    entrada,
    ...RECETA,
    salida,
  ]);
  if (r.codigo !== 0) {
    throw new Error(
      `ffmpeg no pudo comprimir el video: ${r.stderr.trim().split("\n").pop() ?? ""}`,
    );
  }

  if (compatible && (await tamano(salida)) >= (await tamano(entrada))) {
    const copia = `${salida}.copia.mp4`;
    if (await reempaquetar(entrada, copia)) {
      await rm(salida, { force: true });
      await rename(copia, salida);
      const final = await sondearVideo(salida);
      return { ...final, bytes: await tamano(salida), estrategia: "original" };
    }
    await rm(copia, { force: true });
  }
  const final = await sondearVideo(salida);
  return { ...final, bytes: await tamano(salida), estrategia: "recomprimido" };
}
