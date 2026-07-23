import { describe, expect, it } from "vitest";
import { baseUsername, correoSintetico, DOMINIO_CORREO_SINTETICO } from "../domain/username";

describe("baseUsername", () => {
  it("inicial del primer nombre + primer apellido, sin acentos ni ñ", () => {
    expect(baseUsername("María José", "García Núñez")).toBe("mgarcia");
    expect(baseUsername("Ángel", "Ñuñez Pérez")).toBe("anunez");
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(baseUsername("  PEDRO ", " DEL VALLE ")).toBe("pdel");
  });

  it("nombres muy cortos obtienen prefijo de respaldo", () => {
    expect(baseUsername("A", "")).toMatch(/^alumno/);
  });
});

describe("correoSintetico", () => {
  it("usa el subdominio NO enrutable de alumnos", () => {
    expect(correoSintetico("mgarcia1234")).toBe(`mgarcia1234@${DOMINIO_CORREO_SINTETICO}`);
    expect(DOMINIO_CORREO_SINTETICO).toBe("alumnos.lgskidsplataforma.com");
  });
});
