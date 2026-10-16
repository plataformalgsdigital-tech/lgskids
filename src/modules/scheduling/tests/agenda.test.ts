import { describe, expect, it } from "vitest";
import { estaLleno, excesoAlAgendar, seSolapan, tramo } from "../domain/agenda";

describe("agendar: reglas puras", () => {
  it("dos clases se pisan si una empieza antes de que la otra termine", () => {
    const a = tramo("2026-10-20T20:00:00Z", 60);
    expect(seSolapan(a, tramo("2026-10-20T20:30:00Z", 60))).toBe(true);
    expect(seSolapan(a, tramo("2026-10-20T19:30:00Z", 60))).toBe(true);
    // Una dentro de la otra también.
    expect(seSolapan(tramo("2026-10-20T19:00:00Z", 180), a)).toBe(true);
  });

  it("terminar justo cuando la otra empieza NO es choque", () => {
    const a = tramo("2026-10-20T20:00:00Z", 60);
    expect(seSolapan(a, tramo("2026-10-20T21:00:00Z", 60))).toBe(false);
    expect(seSolapan(a, tramo("2026-10-20T19:00:00Z", 60))).toBe(false);
  });

  it("lleno = sin cupo libre; un límite 0 no limita", () => {
    expect(estaLleno(12, 12)).toBe(true);
    expect(estaLleno(12, 11)).toBe(false);
    expect(estaLleno(0, 50)).toBe(false);
  });

  it("el sobrecupo cuenta los lugares por encima del límite", () => {
    expect(excesoAlAgendar(12, 11)).toBe(0);
    expect(excesoAlAgendar(12, 12)).toBe(1);
    expect(excesoAlAgendar(12, 14)).toBe(3);
    expect(excesoAlAgendar(0, 14)).toBe(0);
  });
});
