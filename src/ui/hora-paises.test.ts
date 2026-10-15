import { describe, expect, it } from "vitest";
import { referenciaHoraria } from "./hora-paises";

describe("hora de Chile y de Colombia", () => {
  it("en el verano austral Chile va 2 horas adelante", () => {
    // 2026-10-15 20:00 UTC: Chile en UTC-3, Colombia en UTC-5.
    expect(referenciaHoraria("2026-10-15T20:00:00Z")).toEqual({
      chile: "17:00",
      colombia: "15:00",
    });
  });

  it("en el invierno austral Chile va 1 hora adelante", () => {
    // 2026-07-15 21:00 UTC: Chile en UTC-4.
    expect(referenciaHoraria("2026-07-15T21:00:00Z")).toEqual({
      chile: "17:00",
      colombia: "16:00",
    });
  });
});
