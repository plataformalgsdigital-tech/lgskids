import { describe, expect, it } from "vitest";
import { diaDeFecha, problemaLinkClub, problemaLinkParaFecha } from "../domain/link-club";

const base = {
  nombre: "Club lectura",
  diaSemana: 5,
  horario: "16:00 - 17:00",
  link: "https://zoom.us/j/1",
};

describe("Links de Clubes", () => {
  it("el día de una fecha va como Date.getDay (0 = domingo)", () => {
    expect(diaDeFecha("2026-10-30")).toBe(5); // viernes
    expect(diaDeFecha("2026-10-31")).toBe(6); // sábado
    expect(diaDeFecha("2026-11-01")).toBe(0); // domingo
  });

  it("exige nombre, día, horario y un link web", () => {
    expect(problemaLinkClub(base)).toBeNull();
    expect(problemaLinkClub({ ...base, nombre: " " })).toMatch(/nombre/);
    expect(problemaLinkClub({ ...base, diaSemana: 7 })).toMatch(/día/);
    expect(problemaLinkClub({ ...base, horario: "" })).toMatch(/horario/);
    expect(problemaLinkClub({ ...base, link: "zoom.us/j/1" })).toMatch(/válida/);
    expect(problemaLinkClub({ ...base, link: "javascript:alert(1)" })).toMatch(/https/);
  });

  it("solo sirve un link activo del MISMO día que el Club", () => {
    const link = { activo: true, diaSemana: 5, nombre: "Club lectura" };
    expect(problemaLinkParaFecha(link, "2026-10-30")).toBeNull();
    expect(problemaLinkParaFecha(link, "2026-10-31")).toMatch(/Viernes.*Sábado/);
    expect(problemaLinkParaFecha({ ...link, activo: false }, "2026-10-30")).toMatch(/desactivado/);
  });
});
