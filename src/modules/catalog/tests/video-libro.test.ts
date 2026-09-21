import { describe, expect, it } from "vitest";
import {
  casillaValida,
  firmarTokenVideos,
  leerNombreArchivoVideo,
  nombreArchivoVideo,
  rutaVideoLibro,
  tokenVideosValido,
} from "../domain/video-libro";

describe("la casilla del video en el libro", () => {
  it("la ruta que escribe diseño es videos/<página>-<n>.mp4", () => {
    expect(rutaVideoLibro(7, 1)).toBe("videos/7-1.mp4");
    expect(rutaVideoLibro(14, 2)).toBe("videos/14-2.mp4");
    expect(nombreArchivoVideo(1, 1)).toBe("1-1.mp4");
  });

  it("se lee de vuelta, y solo si es una casilla válida", () => {
    expect(leerNombreArchivoVideo("7-1.mp4")).toEqual({ pagina: 7, orden: 1 });
    expect(leerNombreArchivoVideo("999-9.mp4")).toEqual({ pagina: 999, orden: 9 });
    expect(leerNombreArchivoVideo("7-0.mp4")).toBeNull(); // el número empieza en 1
    expect(leerNombreArchivoVideo("0-1.mp4")).toBeNull(); // y la página también
    expect(leerNombreArchivoVideo("7.mp4")).toBeNull();
    expect(leerNombreArchivoVideo("1000-1.mp4")).toBeNull();
    expect(leerNombreArchivoVideo("7-1.mp4.exe")).toBeNull();
    expect(leerNombreArchivoVideo("../7-1.mp4")).toBeNull();
  });

  it("página 1 a 999 —la que VE el niño—, número 1 a 9, enteros", () => {
    expect(casillaValida(1, 1)).toBe(true);
    expect(casillaValida(999, 9)).toBe(true);
    expect(casillaValida(0, 1)).toBe(false);
    expect(casillaValida(-1, 1)).toBe(false);
    expect(casillaValida(7, 10)).toBe(false);
    expect(casillaValida(7.5, 1)).toBe(false);
    expect(casillaValida(Number.NaN, 1)).toBe(false);
  });
});

describe("token de los videos", () => {
  const SECRETO = "s".repeat(40);
  const LIBRO = "0b6e3f7a-1111-4222-8333-944455556666";
  const AHORA = 1_800_000_000;

  it("vale para ESE libro y hasta que vence", () => {
    const t = firmarTokenVideos(LIBRO, AHORA + 60, SECRETO);
    expect(tokenVideosValido(LIBRO, t, SECRETO, AHORA)).toBe(true);
    expect(tokenVideosValido(LIBRO, t, SECRETO, AHORA + 61)).toBe(false);
  });

  it("no sirve para otro libro, con otro secreto, ni tocado a mano", () => {
    const t = firmarTokenVideos(LIBRO, AHORA + 60, SECRETO);
    expect(tokenVideosValido("otro-libro", t, SECRETO, AHORA)).toBe(false);
    expect(tokenVideosValido(LIBRO, t, "x".repeat(40), AHORA)).toBe(false);
    // Alargar el vencimiento sin volver a firmar no cuela.
    const [, firma] = t.split(".");
    expect(
      tokenVideosValido(LIBRO, `${String(AHORA + 99999)}.${firma ?? ""}`, SECRETO, AHORA),
    ).toBe(false);
    expect(tokenVideosValido(LIBRO, "basura", SECRETO, AHORA)).toBe(false);
    expect(tokenVideosValido(LIBRO, "", SECRETO, AHORA)).toBe(false);
  });
});
