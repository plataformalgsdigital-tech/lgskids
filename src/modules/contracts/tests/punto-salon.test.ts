import { describe, expect, it } from "vitest";
import { leccionesSugeridas } from "../domain/punto-salon";

describe("punto del salón como ubicación de progresión", () => {
  it("la primera lección del nivel: nada cursado todavía", () => {
    expect(leccionesSugeridas({ pos: 1, total: 18 }, 4)).toBe(0);
  });

  it("a mitad de nivel, la mitad de las prácticas", () => {
    expect(leccionesSugeridas({ pos: 10, total: 18 }, 4)).toBe(2);
  });

  it("en la última lección del nivel no se da el nivel por cerrado", () => {
    // Cerrarlo exige el Level Up, que no se convalida.
    expect(leccionesSugeridas({ pos: 18, total: 18 }, 4)).toBe(3);
  });

  it("sin clases dictadas: el Welcome", () => {
    expect(leccionesSugeridas({ pos: null, total: null }, 4)).toBe(0);
  });
});
