import { describe, expect, it } from "vitest";
import { ValidationError } from "@/platform/errors";
import { derivarEstadoCampania, planificarCampania } from "../domain/campania";

describe("derivarEstadoCampania — estados SIEMPRE derivados por fecha (2.2)", () => {
  const inicio = "2026-08-03";
  const fin = "2026-10-25";

  it("antes del inicio: En matrícula", () => {
    expect(derivarEstadoCampania(inicio, fin, "2026-07-24")).toBe("EN_MATRICULA");
  });

  it("el día de inicio: Activa (borde inclusivo)", () => {
    expect(derivarEstadoCampania(inicio, fin, "2026-08-03")).toBe("ACTIVA");
  });

  it("el último día: Activa (borde inclusivo)", () => {
    expect(derivarEstadoCampania(inicio, fin, "2026-10-25")).toBe("ACTIVA");
  });

  it("después del fin: Cerrada", () => {
    expect(derivarEstadoCampania(inicio, fin, "2026-10-26")).toBe("CERRADA");
  });
});

describe("planificarCampania", () => {
  it("calcula el fin nominal: inicio + semanas*7 - 1 días", () => {
    const plan = planificarCampania({
      nombre: "Campaña Agosto",
      inicio: "2026-08-03",
      duracionSemanas: 12,
    });
    expect(plan.fin).toBe("2026-10-25"); // 84 días - 1
  });

  it("cruza fin de año sin errores de zona (DATE puro)", () => {
    const plan = planificarCampania({
      nombre: "Campaña Verano",
      inicio: "2026-12-07",
      duracionSemanas: 8,
    });
    expect(plan.fin).toBe("2027-01-31");
  });

  it("recorta espacios del nombre", () => {
    const plan = planificarCampania({
      nombre: "  Campaña X  ",
      inicio: "2026-08-03",
      duracionSemanas: 1,
    });
    expect(plan.nombre).toBe("Campaña X");
  });

  it.each([
    [{ nombre: "ab", inicio: "2026-08-03", duracionSemanas: 12 }],
    [{ nombre: "Campaña", inicio: "03-08-2026", duracionSemanas: 12 }],
    [{ nombre: "Campaña", inicio: "2026-08-03", duracionSemanas: 0 }],
    [{ nombre: "Campaña", inicio: "2026-08-03", duracionSemanas: 53 }],
    [{ nombre: "Campaña", inicio: "2026-08-03", duracionSemanas: 2.5 }],
  ])("rechaza entradas inválidas %#", (input) => {
    expect(() => planificarCampania(input)).toThrow(ValidationError);
  });
});
