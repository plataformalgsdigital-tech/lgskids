import { describe, expect, it } from "vitest";
import { MAX_SEMANAS_TANDA, diasEntre, fechasTanda, sumarDias } from "../domain/tanda-club";

describe("tanda de clubs", () => {
  it("repite el día de la semana de la fecha elegida, inicio y final incluidos", () => {
    // 2026-10-23 es viernes; la tanda va del lunes 19 al viernes 13 de noviembre.
    const r = fechasTanda({ fecha: "2026-10-23", inicio: "2026-10-19", fin: "2026-11-13" });
    expect(r.problema).toBeNull();
    expect(r.fechas).toEqual(["2026-10-23", "2026-10-30", "2026-11-06", "2026-11-13"]);
  });

  it("empieza en la primera semana aunque la fecha elegida sea posterior", () => {
    const r = fechasTanda({ fecha: "2026-11-05", inicio: "2026-10-19", fin: "2026-11-05" });
    expect(r.fechas).toEqual(["2026-10-22", "2026-10-29", "2026-11-05"]);
  });

  it("rechaza la fecha fuera de la tanda, el inicio después del final y lo demasiado largo", () => {
    expect(
      fechasTanda({ fecha: "2026-12-01", inicio: "2026-10-19", fin: "2026-11-13" }).problema,
    ).toMatch(/dentro de la tanda/);
    expect(
      fechasTanda({ fecha: "2026-10-20", inicio: "2026-11-13", fin: "2026-10-19" }).problema,
    ).toMatch(/anterior/);
    const largo = fechasTanda({ fecha: "2026-10-19", inicio: "2026-10-19", fin: "2028-10-19" });
    expect(largo.problema).toContain(String(MAX_SEMANAS_TANDA));
    expect(fechasTanda({ fecha: "2026-13-01", inicio: "x", fin: "y" }).problema).toMatch(/YYYY/);
  });

  it("un año de curso cabe (52-53 semanas)", () => {
    const r = fechasTanda({ fecha: "2026-10-19", inicio: "2026-10-19", fin: "2027-10-19" });
    expect(r.problema).toBeNull();
    expect(r.fechas.length).toBe(53);
  });

  it("corre fechas por días (cruzando meses y el cambio de hora)", () => {
    expect(diasEntre("2026-10-23", "2026-10-27")).toBe(4);
    expect(diasEntre("2026-10-27", "2026-10-23")).toBe(-4);
    expect(sumarDias("2026-10-30", 3)).toBe("2026-11-02");
    expect(sumarDias("2027-04-03", 1)).toBe("2027-04-04");
  });
});
