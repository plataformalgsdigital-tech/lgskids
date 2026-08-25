import { describe, expect, it } from "vitest";
import { ValidationError } from "@/platform/errors";
import {
  derivarEstadoCampania,
  planificarCampania,
  sumarDias,
  sumarMeses,
} from "../domain/campania";

describe("derivarEstadoCampania — estados SIEMPRE derivados por fecha", () => {
  // EN_MATRÍCULA hasta el cierre de venta; ACTIVA hasta el fin; luego INACTIVA.
  const finalVenta = "2026-10-05";
  const fin = "2027-09-01";

  it("hasta el cierre de matrícula: En matrícula (borde inclusivo)", () => {
    expect(derivarEstadoCampania(finalVenta, fin, "2026-09-14")).toBe("EN_MATRICULA");
    expect(derivarEstadoCampania(finalVenta, fin, "2026-10-05")).toBe("EN_MATRICULA");
  });

  it("pasado el cierre y hasta el fin: Activa", () => {
    expect(derivarEstadoCampania(finalVenta, fin, "2026-10-06")).toBe("ACTIVA");
    expect(derivarEstadoCampania(finalVenta, fin, "2027-09-01")).toBe("ACTIVA");
  });

  it("después del fin: Cerrada (Inactiva)", () => {
    expect(derivarEstadoCampania(finalVenta, fin, "2027-09-02")).toBe("CERRADA");
  });
});

describe("aritmética de fechas DATE puro", () => {
  it("suma 12 meses (mismo día del año siguiente)", () => {
    expect(sumarMeses("2026-09-01", 12)).toBe("2027-09-01");
  });
  it("suma 3 semanas = 21 días, cruzando fin de mes", () => {
    expect(sumarDias("2026-09-14", 21)).toBe("2026-10-05");
  });
});

describe("planificarCampania", () => {
  it("fin por defecto = inicio + 12 meses; cierre de venta = inicio del curso + 3 semanas", () => {
    const plan = planificarCampania({
      nombre: "Campaña Septiembre",
      inicio: "2026-09-01",
      cursoInicio: "2026-09-14",
    });
    expect(plan.fin).toBe("2027-09-01");
    expect(plan.finalVenta).toBe("2026-10-05");
    expect(plan.cursoInicio).toBe("2026-09-14");
  });

  it("respeta un fin editado (no usa los 12 meses)", () => {
    const plan = planificarCampania({
      nombre: "Campaña Corta",
      inicio: "2026-09-01",
      cursoInicio: "2026-09-14",
      fin: "2026-12-20",
    });
    expect(plan.fin).toBe("2026-12-20");
  });

  it("recorta espacios del nombre", () => {
    const plan = planificarCampania({
      nombre: "  Campaña X  ",
      inicio: "2026-08-03",
      cursoInicio: "2026-08-03",
    });
    expect(plan.nombre).toBe("Campaña X");
  });

  it.each([
    [{ nombre: "ab", inicio: "2026-08-03", cursoInicio: "2026-08-03" }],
    [{ nombre: "Campaña", inicio: "03-08-2026", cursoInicio: "2026-08-03" }],
    [{ nombre: "Campaña", inicio: "2026-08-03", cursoInicio: "2026-07-01" }], // curso antes de campaña
    [{ nombre: "Campaña", inicio: "2026-08-03", cursoInicio: "2026-08-03", fin: "2026-08-01" }], // fin antes del curso
  ])("rechaza entradas inválidas %#", (input) => {
    expect(() => planificarCampania(input)).toThrow(ValidationError);
  });
});
