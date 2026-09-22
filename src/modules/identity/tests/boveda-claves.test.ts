import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validarPassword } from "../domain/password-policy";
import { generarPasswordInicial } from "../domain/credenciales";
import { baseUsername } from "../domain/username";
import { cifrarClave, descifrarClave } from "../infrastructure/boveda-claves";

const LLAVE = randomBytes(32);
const USUARIO = "0b6e3f7a-1111-4222-8333-944455556666";

describe("bóveda de claves (AES-256-GCM)", () => {
  it("lo que se cifra se recupera tal cual", () => {
    const copia = cifrarClave("poketimu42", USUARIO, LLAVE);
    expect(copia.startsWith("v1:")).toBe(true);
    expect(copia).not.toContain("poketimu42");
    expect(descifrarClave(copia, USUARIO, LLAVE)).toBe("poketimu42");
  });

  it("la misma clave cifrada dos veces da copias distintas (IV al azar)", () => {
    expect(cifrarClave("x1y2z3w4v5", USUARIO, LLAVE)).not.toBe(
      cifrarClave("x1y2z3w4v5", USUARIO, LLAVE),
    );
  });

  it("una copia alterada, de OTRA cuenta o con otra llave no se lee: lanza", () => {
    const copia = cifrarClave("poketimu42", USUARIO, LLAVE);
    const partes = copia.split(":");
    const alterada = [...partes.slice(0, 3), Buffer.from("otra cosa").toString("base64")].join(":");
    expect(() => descifrarClave(alterada, USUARIO, LLAVE)).toThrow();
    // Copiar la copia a la fila de otro usuario no la vuelve legible como suya.
    expect(() => descifrarClave(copia, "otro-usuario", LLAVE)).toThrow();
    expect(() => descifrarClave(copia, USUARIO, randomBytes(32))).toThrow();
    expect(() => descifrarClave("basura", USUARIO, LLAVE)).toThrow();
  });
});

describe("credenciales generadas", () => {
  it("la clave generada cumple la política y se puede dictar", () => {
    for (let i = 0; i < 50; i += 1) {
      const clave = generarPasswordInicial();
      expect(clave).toMatch(/^([bdfgklmnprstvz][aeiou]){4}\d{2}$/);
      expect(() => validarPassword(clave)).not.toThrow();
    }
  });

  it("el usuario del staff sale del nombre igual que el del alumno", () => {
    expect(baseUsername("Camilo Andrés", "Gamboa Ríos", "staff")).toBe("cgamboa");
    // Sin nombre utilizable, el respaldo: nunca "alumno" para un coordinador.
    expect(baseUsername("", "", "staff")).toBe("staff");
    expect(baseUsername("", "")).toBe("alumno");
  });
});
