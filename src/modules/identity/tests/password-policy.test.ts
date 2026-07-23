import { describe, expect, it } from "vitest";
import { ValidationError } from "@/platform/errors";
import { validarPassword } from "../domain/password-policy";

describe("validarPassword", () => {
  it("acepta contraseñas con 10+ caracteres, letras y números", () => {
    expect(() => validarPassword("NuevaClave99")).not.toThrow();
  });

  it("rechaza contraseñas cortas", () => {
    expect(() => validarPassword("Abc123")).toThrow(ValidationError);
  });

  it("rechaza contraseñas sin números", () => {
    expect(() => validarPassword("SoloLetrasLargas")).toThrow(ValidationError);
  });

  it("rechaza contraseñas sin letras", () => {
    expect(() => validarPassword("1234567890123")).toThrow(ValidationError);
  });

  it("reporta todos los problemas en details", () => {
    try {
      validarPassword("abc");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toHaveLength(2); // corta + sin número
    }
  });
});
