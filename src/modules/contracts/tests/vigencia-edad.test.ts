import { describe, expect, it } from "vitest";
import { ValidationError } from "@/platform/errors";
import { edadEnFecha, validarEdadParaTipo } from "../domain/edad";
import { contratoVencido } from "../domain/vigencia";

describe("contratoVencido — LA función única (+2 días de gracia)", () => {
  const final = "2026-08-10";

  it("NO vencido el último día del contrato", () => {
    expect(contratoVencido(final, "2026-08-10")).toBe(false);
  });

  it("NO vencido al día siguiente (día de gracia 1)", () => {
    expect(contratoVencido(final, "2026-08-11")).toBe(false);
  });

  it("VENCIDO exactamente a los 2 días", () => {
    expect(contratoVencido(final, "2026-08-12")).toBe(true);
  });

  it("maneja el cruce de mes/año en la suma de gracia", () => {
    expect(contratoVencido("2026-12-31", "2027-01-01")).toBe(false);
    expect(contratoVencido("2026-12-31", "2027-01-02")).toBe(true);
  });
});

describe("edadEnFecha", () => {
  it("cumple años el mismo día", () => {
    expect(edadEnFecha("2018-08-03", "2026-08-03")).toBe(8);
  });
  it("un día antes del cumpleaños todavía no suma", () => {
    expect(edadEnFecha("2018-08-03", "2026-08-02")).toBe(7);
  });
});

describe("validarEdadParaTipo (Junior 6–9 · Youngster 10–13)", () => {
  it("acepta 6 y 9 años en JUNIOR", () => {
    expect(() => validarEdadParaTipo("2020-01-15", "2026-08-03", "JUNIOR")).not.toThrow(); // 6
    expect(() => validarEdadParaTipo("2017-01-15", "2026-08-03", "JUNIOR")).not.toThrow(); // 9
  });
  it("rechaza 10 años en JUNIOR y 9 en YOUNGSTER", () => {
    expect(() => validarEdadParaTipo("2016-01-15", "2026-08-03", "JUNIOR")).toThrow(
      ValidationError,
    );
    expect(() => validarEdadParaTipo("2017-01-15", "2026-08-03", "YOUNGSTER")).toThrow(
      ValidationError,
    );
  });
  it("acepta 10 y 13 en YOUNGSTER; rechaza 14", () => {
    expect(() => validarEdadParaTipo("2016-01-15", "2026-08-03", "YOUNGSTER")).not.toThrow(); // 10
    expect(() => validarEdadParaTipo("2013-01-15", "2026-08-03", "YOUNGSTER")).not.toThrow(); // 13
    expect(() => validarEdadParaTipo("2012-01-15", "2026-08-03", "YOUNGSTER")).toThrow(
      ValidationError,
    );
  });
  it("la edad se evalúa A LA FECHA DE INICIO, no a hoy", () => {
    // Nace 2016-09-01: el 2026-08-03 tiene 9 (Junior OK); el 2026-09-10 tiene 10 (Junior NO).
    expect(() => validarEdadParaTipo("2016-09-01", "2026-08-03", "JUNIOR")).not.toThrow();
    expect(() => validarEdadParaTipo("2016-09-01", "2026-09-10", "JUNIOR")).toThrow(
      ValidationError,
    );
  });
});
