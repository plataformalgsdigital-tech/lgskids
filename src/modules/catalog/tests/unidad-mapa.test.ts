import { describe, expect, it } from "vitest";
import { UNIDADES_MAPA, unidadMapa } from "../domain/unidad-mapa";

/**
 * El texto de la unidad lo escribe una persona en un CSV, así que esta función
 * es la que decide si una lección se abre o no desde el mapa. Lo que se prueba
 * aquí es justo lo que hay en el catálogo real.
 */
describe("unidad del catálogo → casilla del mapa", () => {
  it("las cuatro casillas del mapa mapean", () => {
    for (let n = 1; n <= UNIDADES_MAPA; n++) {
      expect(unidadMapa(`Unidad ${String(n)}`)).toBe(n);
    }
  });

  it("la Unidad 0 NO es casilla: es la bienvenida de la isla", () => {
    expect(unidadMapa("Unidad 0")).toBeNull();
  });

  it("repasos y evaluaciones no tienen casilla", () => {
    expect(unidadMapa("Repaso 2")).toBeNull();
    expect(unidadMapa("Evaluacion 1")).toBeNull();
    // Errata real del catálogo: tampoco debe colarse.
    expect(unidadMapa("Evalucion 6")).toBeNull();
  });

  it("tolera cómo se escribe a mano: mayúsculas, espacios y acentos", () => {
    expect(unidadMapa("UNIDAD 2")).toBe(2);
    expect(unidadMapa("  unidad   3  ")).toBe(3);
    expect(unidadMapa("unidád 4")).toBe(4);
  });

  it("una unidad más allá del mapa no inventa casilla", () => {
    expect(unidadMapa("Unidad 5")).toBeNull();
    expect(unidadMapa("Unidad 12")).toBeNull();
  });

  it("vacío o ausente no mapea", () => {
    expect(unidadMapa(null)).toBeNull();
    expect(unidadMapa(undefined)).toBeNull();
    expect(unidadMapa("")).toBeNull();
    expect(unidadMapa("Unidad")).toBeNull();
  });
});
