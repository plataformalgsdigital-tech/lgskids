import { describe, expect, it } from "vitest";
import { celdaCsv, decodificarCsv, textoCsv } from "./csv";

describe("CSV del panel", () => {
  it("separa con ; , empieza con BOM y escapa comillas y separadores", () => {
    const t = textoCsv(["a", "b"], [["uno; dos", 'dijo "hola"']]);
    expect(t.charCodeAt(0)).toBe(0xfeff);
    expect(t.slice(1)).toBe('a;b\r\n"uno; dos";"dijo ""hola"""');
  });

  it("neutraliza fórmulas pero deja los teléfonos y números tal cual", () => {
    expect(celdaCsv("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(celdaCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celdaCsv("-cmd")).toBe("'-cmd");
    expect(celdaCsv("+573001234567")).toBe("+573001234567");
    expect(celdaCsv(-5)).toBe("-5");
    expect(celdaCsv(null)).toBe("");
    expect(celdaCsv(true)).toBe("sí");
  });

  it("lee el CSV en UTF-8 y, si no lo es, como el ANSI del Excel en español", () => {
    const utf8 = new TextEncoder().encode("Evaluación;don’t");
    expect(decodificarCsv(utf8)).toEqual({ texto: "Evaluación;don’t", ansi: false });
    // "Evaluación;don’t" guardado por Excel en Windows-1252: ó = 0xF3, ’ = 0x92.
    const ansi = Uint8Array.from([
      ...new TextEncoder().encode("Evaluaci"),
      0xf3,
      ...new TextEncoder().encode("n;don"),
      0x92,
      0x74,
    ]);
    expect(decodificarCsv(ansi)).toEqual({ texto: "Evaluación;don’t", ansi: true });
  });
});
