import { describe, expect, it } from "vitest";
import { domingoPascua, feriadosDelPais } from "../domain/feriados";

describe("domingoPascua (computus) — años conocidos", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2030, "2030-04-21"],
  ])("Pascua %i = %s", (year, esperado) => {
    expect(domingoPascua(year)).toBe(esperado);
  });
});

describe("feriados de Chile 2026", () => {
  const fechas = feriadosDelPais("CL", 2026).map((f) => f.fecha);

  it("Viernes y Sábado Santo (Pascua 2026-04-05)", () => {
    expect(fechas).toContain("2026-04-03");
    expect(fechas).toContain("2026-04-04");
  });

  it("San Pedro y San Pablo 29/6/2026 (lunes) NO se traslada", () => {
    expect(fechas).toContain("2026-06-29");
  });

  it("Fiestas Patrias 18 y 19 de septiembre", () => {
    expect(fechas).toContain("2026-09-18");
    expect(fechas).toContain("2026-09-19");
  });
});

describe("traslados de ley chilenos", () => {
  it("2027: San Pedro 29/6 cae martes → lunes 28/6", () => {
    const fechas = feriadosDelPais("CL", 2027).map((f) => f.fecha);
    expect(fechas).toContain("2027-06-28");
    expect(fechas).not.toContain("2027-06-29");
  });
});

describe("Ley Emiliani (Colombia)", () => {
  it("2026: Reyes 6/1 (martes) → lunes 12/1", () => {
    const fechas = feriadosDelPais("CO", 2026).map((f) => f.fecha);
    expect(fechas).toContain("2026-01-12");
    expect(fechas).not.toContain("2026-01-06");
  });

  it("2026: San José 19/3 (jueves) → lunes 23/3", () => {
    const fechas = feriadosDelPais("CO", 2026).map((f) => f.fecha);
    expect(fechas).toContain("2026-03-23");
  });

  it("2026: Independencia 20/7 (lunes) NO se mueve", () => {
    const fechas = feriadosDelPais("CO", 2026).map((f) => f.fecha);
    expect(fechas).toContain("2026-07-20");
  });

  it("religiosos móviles: Ascensión 2026 (Pascua+39=14/5 jueves) → lunes 18/5", () => {
    const fechas = feriadosDelPais("CO", 2026).map((f) => f.fecha);
    expect(fechas).toContain("2026-05-18");
  });
});

describe("Ecuador y Perú 2026", () => {
  it("Ecuador: Carnaval lunes 16/2 y martes 17/2 (Pascua-48/-47)", () => {
    const fechas = feriadosDelPais("EC", 2026).map((f) => f.fecha);
    expect(fechas).toContain("2026-02-16");
    expect(fechas).toContain("2026-02-17");
  });

  it("Perú: Jueves y Viernes Santo + Fiestas Patrias", () => {
    const fechas = feriadosDelPais("PE", 2026).map((f) => f.fecha);
    expect(fechas).toContain("2026-04-02");
    expect(fechas).toContain("2026-04-03");
    expect(fechas).toContain("2026-07-28");
    expect(fechas).toContain("2026-07-29");
  });
});

describe("funciona en años futuros sin mantenimiento", () => {
  it("2030 genera feriados para los 4 países", () => {
    for (const pais of ["CL", "CO", "EC", "PE"]) {
      const feriados = feriadosDelPais(pais, 2030);
      expect(feriados.length).toBeGreaterThan(8);
      expect(feriados.every((f) => f.fecha.startsWith("2030"))).toBe(true);
    }
  });
});
