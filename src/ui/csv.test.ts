import { describe, expect, it } from "vitest";
import { celdaCsv, textoCsv } from "./csv";

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
});
