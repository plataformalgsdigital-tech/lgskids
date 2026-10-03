import { describe, expect, it } from "vitest";
import { estadoNivel, posicionRespecto } from "../domain/nivel";

const base = {
  totalPracticas: 4,
  practicasAprobadas: 0,
  levelUpAprobado: false,
  leccionesUbicadas: 0,
};

describe("estado de un nivel con ubicación académica", () => {
  it("sin ubicación, manda solo la evidencia", () => {
    expect(
      estadoNivel({
        ...base,
        practicasAprobadas: 4,
        levelUpAprobado: true,
        posicion: "SIN_UBICACION",
      }),
    ).toEqual({ lecciones: 4, levelUp: true, completado: true, convalidado: false });
    expect(
      estadoNivel({ ...base, practicasAprobadas: 3, posicion: "SIN_UBICACION" }).completado,
    ).toBe(false);
  });

  it("un nivel ANTERIOR a la ubicación queda completado por convalidación, sin medalla", () => {
    expect(estadoNivel({ ...base, posicion: "ANTES" })).toEqual({
      lecciones: 4,
      levelUp: false,
      completado: true,
      convalidado: true,
    });
  });

  it("si el niño ya lo había ganado, no es convalidado: conserva su medalla", () => {
    expect(
      estadoNivel({ ...base, practicasAprobadas: 4, levelUpAprobado: true, posicion: "ANTES" })
        .convalidado,
    ).toBe(false);
  });

  it("en el nivel de la ubicación arranca con las lecciones dadas por cursadas", () => {
    expect(estadoNivel({ ...base, leccionesUbicadas: 2, posicion: "EN" })).toEqual({
      lecciones: 2,
      levelUp: false,
      completado: false,
      convalidado: false,
    });
  });

  it("la ubicación es un PISO: nunca resta lo que el niño aprobó", () => {
    expect(
      estadoNivel({ ...base, practicasAprobadas: 3, leccionesUbicadas: 1, posicion: "EN" })
        .lecciones,
    ).toBe(3);
  });

  it("el Level Up no se convalida: sin él, el nivel de la ubicación no se cierra", () => {
    expect(estadoNivel({ ...base, leccionesUbicadas: 4, posicion: "EN" }).completado).toBe(false);
    expect(
      estadoNivel({ ...base, leccionesUbicadas: 4, levelUpAprobado: true, posicion: "EN" })
        .completado,
    ).toBe(true);
  });

  it("acota lecciones fuera de rango", () => {
    expect(estadoNivel({ ...base, leccionesUbicadas: 9, posicion: "EN" }).lecciones).toBe(4);
  });

  it("posición por orden del nivel", () => {
    expect(posicionRespecto(1, 3)).toBe("ANTES");
    expect(posicionRespecto(3, 3)).toBe("EN");
    expect(posicionRespecto(4, 3)).toBe("DESPUES");
    expect(posicionRespecto(4, null)).toBe("SIN_UBICACION");
  });
});
