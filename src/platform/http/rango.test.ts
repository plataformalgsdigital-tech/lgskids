import { describe, expect, it } from "vitest";
import { leerRango, respuestaConRango } from "./rango";

describe("leerRango", () => {
  it("sin cabecera, el archivo entero", () => {
    expect(leerRango(null, 100)).toBeNull();
    expect(leerRango("", 100)).toBeNull();
  });

  it("lo que pide Safari para sondear (bytes=0-1) y lo que pide Chrome (bytes=0-)", () => {
    expect(leerRango("bytes=0-1", 100)).toEqual({ inicio: 0, fin: 1 });
    expect(leerRango("bytes=0-", 100)).toEqual({ inicio: 0, fin: 99 });
  });

  it("un fin más allá del archivo se recorta; los últimos N bytes con bytes=-N", () => {
    expect(leerRango("bytes=90-500", 100)).toEqual({ inicio: 90, fin: 99 });
    expect(leerRango("bytes=-10", 100)).toEqual({ inicio: 90, fin: 99 });
    expect(leerRango("bytes=-500", 100)).toEqual({ inicio: 0, fin: 99 });
  });

  it("lo que no cabe o no se entiende es 416", () => {
    expect(leerRango("bytes=100-", 100)).toBe("invalido");
    expect(leerRango("bytes=50-10", 100)).toBe("invalido");
    expect(leerRango("bytes=-0", 100)).toBe("invalido");
    expect(leerRango("items=0-1", 100)).toBe("invalido");
    expect(leerRango("bytes=-", 100)).toBe("invalido");
  });
});

describe("respuestaConRango", () => {
  const bytes = Buffer.from("0123456789");
  const tipo = { "Content-Type": "video/mp4" };

  it("206 con el tramo exacto y su Content-Range", async () => {
    const r = respuestaConRango(bytes, "bytes=2-5", tipo);
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(r.headers.get("Accept-Ranges")).toBe("bytes");
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe("2345");
  });

  it("200 con todo cuando no se pide rango, y 416 cuando el rango no cabe", async () => {
    const entero = respuestaConRango(bytes, null, tipo);
    expect(entero.status).toBe(200);
    expect(Buffer.from(await entero.arrayBuffer()).toString()).toBe("0123456789");
    const fuera = respuestaConRango(bytes, "bytes=20-", tipo);
    expect(fuera.status).toBe(416);
    expect(fuera.headers.get("Content-Range")).toBe("bytes */10");
  });
});
