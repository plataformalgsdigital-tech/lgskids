import { describe, expect, it } from "vitest";
import { problemaClaveNino } from "@/modules/identity";
import {
  enlacePerfil,
  estadoEnlacePerfil,
  hashTokenPerfil,
  nuevoTokenPerfil,
  pareceTokenPerfil,
  problemaTextoPerfil,
} from "../domain/enlace-perfil";

describe("enlace de creación de perfil", () => {
  it("el token es de 32 bytes, distinto cada vez, y de la base solo sale su hash", () => {
    const a = nuevoTokenPerfil();
    const b = nuevoTokenPerfil();
    expect(a).not.toBe(b);
    expect(pareceTokenPerfil(a)).toBe(true);
    expect(hashTokenPerfil(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTokenPerfil(a)).not.toContain(a);
  });

  it("rechaza lo que no tiene forma de token antes de ir a la base", () => {
    expect(pareceTokenPerfil("")).toBe(false);
    expect(pareceTokenPerfil("abc")).toBe(false);
    expect(pareceTokenPerfil(`${"a".repeat(42)}'`)).toBe(false);
  });

  it("arma la URL de la página pública", () => {
    expect(enlacePerfil("https://app.lgskidsplataforma.com", "T0K")).toBe(
      "https://app.lgskidsplataforma.com/crear-perfil/T0K",
    );
  });

  it("usado manda sobre revocado; sin nada, está vigente (no vence)", () => {
    expect(estadoEnlacePerfil({ usadoEn: null, revocadoEn: null })).toBe("VIGENTE");
    expect(estadoEnlacePerfil({ usadoEn: "x", revocadoEn: "y" })).toBe("USADO");
    expect(estadoEnlacePerfil({ usadoEn: null, revocadoEn: "y" })).toBe("REVOCADO");
  });

  it("los textos del perfil son obligatorios y acotados", () => {
    expect(problemaTextoPerfil("Hobbies", "  ")).not.toBeNull();
    expect(problemaTextoPerfil("Hobbies", "x".repeat(1001))).not.toBeNull();
    expect(problemaTextoPerfil("Hobbies", "Fútbol")).toBeNull();
  });

  it("la clave del niño: 8+ caracteres, con letras y números", () => {
    expect(problemaClaveNino("rocky1")).not.toBeNull();
    expect(problemaClaveNino("rockyrocky")).not.toBeNull();
    expect(problemaClaveNino("12345678")).not.toBeNull();
    expect(problemaClaveNino("rocky2026")).toBeNull();
  });
});
