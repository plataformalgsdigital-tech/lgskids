import { describe, expect, it } from "vitest";
import {
  PARADAS,
  PARADAS_MAPA,
  PARADA_WELCOME,
  UNIDADES_MAPA,
  caminoAbierto,
  etiquetaParada,
  paradaValida,
  todasLasUnidades,
  unidadMapa,
} from "../domain/unidad-mapa";

/**
 * El texto de la unidad lo escribe una persona en un CSV, así que esta función
 * es la que decide si una lección se abre o no desde el mapa. Lo que se prueba
 * aquí es justo lo que hay en el catálogo real.
 */
describe("unidad del catálogo → parada del mapa", () => {
  it("las cuatro unidades numeradas mapean", () => {
    for (let n = 1; n <= UNIDADES_MAPA; n++) {
      expect(unidadMapa(`Unidad ${String(n)}`)).toBe(n);
    }
  });

  it("la Unidad 0 ES la parada Welcome, con su propia insignia", () => {
    // Antes se descartaba por considerarla solo un cartel. El mapa nuevo le da
    // parada propia y el cuadernillo UNIT 0-1 le entrega "Let's chat about me".
    expect(unidadMapa("Unidad 0")).toBe(PARADA_WELCOME);
    expect(PARADA_WELCOME).toBe(0);
  });

  it("la isla tiene cinco paradas: el Welcome y cuatro unidades", () => {
    expect(PARADAS_MAPA).toBe(5);
    expect(PARADAS).toEqual([0, 1, 2, 3, 4]);
  });

  it("repasos y evaluaciones no tienen parada", () => {
    expect(unidadMapa("Repaso 2")).toBeNull();
    expect(unidadMapa("Evaluacion 1")).toBeNull();
    // Errata real del catálogo: tampoco debe colarse.
    expect(unidadMapa("Evalucion 6")).toBeNull();
  });

  it("tolera cómo se escribe a mano: mayúsculas, espacios y acentos", () => {
    expect(unidadMapa("UNIDAD 2")).toBe(2);
    expect(unidadMapa("  unidad   3  ")).toBe(3);
    expect(unidadMapa("unidád 4")).toBe(4);
    expect(unidadMapa("UNIDAD  0")).toBe(PARADA_WELCOME);
  });

  it("una unidad más allá del mapa no inventa parada", () => {
    expect(unidadMapa("Unidad 5")).toBeNull();
    expect(unidadMapa("Unidad 12")).toBeNull();
  });

  it("vacío o ausente no mapea", () => {
    expect(unidadMapa(null)).toBeNull();
    expect(unidadMapa(undefined)).toBeNull();
    expect(unidadMapa("")).toBeNull();
    expect(unidadMapa("Unidad")).toBeNull();
  });

  it("paradaValida acepta 0..4 y rechaza lo demás", () => {
    for (const n of PARADAS) expect(paradaValida(n)).toBe(true);
    expect(paradaValida(-1)).toBe(false);
    expect(paradaValida(5)).toBe(false);
    expect(paradaValida(1.5)).toBe(false);
    expect(paradaValida("2")).toBe(false);
    expect(paradaValida(undefined)).toBe(false);
  });

  it("la parada 0 se muestra como Welcome, no como 'Unidad 0'", () => {
    expect(etiquetaParada(PARADA_WELCOME)).toBe("Welcome");
    expect(etiquetaParada(1)).toBe("Unidad 1");
    expect(etiquetaParada(4)).toBe("Unidad 4");
  });
});

/**
 * Lo abierto es un RECORRIDO, no casillas sueltas: el niño que va en la Unidad
 * 3 ya pasó por la 1 y la 2, y su material tiene que seguir a mano.
 */
describe("camino abierto", () => {
  it("abrir la Unidad 3 deja abierto todo lo anterior", () => {
    expect(caminoAbierto([3])).toEqual([0, 1, 2, 3]);
  });

  it("sin nada abierto queda solo el Welcome, que es el punto de partida", () => {
    expect(caminoAbierto([])).toEqual([PARADA_WELCOME]);
    expect(caminoAbierto([PARADA_WELCOME])).toEqual([PARADA_WELCOME]);
  });

  it("manda la más alta, en cualquier orden y sin repetir", () => {
    expect(caminoAbierto([2, 1, 2])).toEqual([0, 1, 2]);
    expect(caminoAbierto([4, 1])).toEqual([0, 1, 2, 3, 4]);
  });

  it("una parada que no existe no estira el camino", () => {
    expect(caminoAbierto([9])).toEqual([PARADA_WELCOME]);
    expect(caminoAbierto([1, 9])).toEqual([0, 1]);
  });

  it("el nivel completo se abre solo al llegar a la última unidad", () => {
    expect(todasLasUnidades(caminoAbierto([3]))).toBe(false);
    expect(todasLasUnidades(caminoAbierto([UNIDADES_MAPA]))).toBe(true);
  });
});
