import { describe, expect, it } from "vitest";
import { ValidationError } from "@/platform/errors";
import { parseExternalRef, validarExternalRef } from "../domain/external-ref";

describe("N° de contrato LGS (PP-NNNNN-YY)", () => {
  it("parsea país, correlativo y año", () => {
    expect(parseExternalRef("01-16016-26")).toEqual({
      prefijo: "01",
      pais: "CL",
      numero: "16016",
      anio: "26",
      sufijo: null,
      base: "01-16016-26",
    });
  });

  /**
   * Un contrato de LGS puede traer varios hermanos y en KIDS cada niño es su
   * propio contrato. LGS manda `contrato#documento` para que cada uno tenga su
   * referencia; sin eso, el segundo hermano caería en la idempotencia del
   * primero y no quedaría inscrito.
   */
  it("acepta el sufijo con el documento del niño, y lo separa del N° base", () => {
    expect(parseExternalRef("02-16016-26#1012345678")).toEqual({
      prefijo: "02",
      pais: "CO",
      numero: "16016",
      anio: "26",
      sufijo: "1012345678",
      base: "02-16016-26",
    });
    // Dos hermanos del MISMO contrato son dos referencias distintas.
    expect(parseExternalRef("02-16016-26#111")?.sufijo).not.toBe(
      parseExternalRef("02-16016-26#222")?.sufijo,
    );
    expect(() => validarExternalRef("02-16016-26#1012345678", "CO")).not.toThrow();
    // El país se sigue comprobando sobre el prefijo, con sufijo o sin él.
    expect(() => validarExternalRef("02-16016-26#111", "CL")).toThrow(ValidationError);
  });

  it("el sufijo no es un cajón de sastre", () => {
    expect(parseExternalRef("02-1-26#")).toBeNull(); // vacío
    expect(parseExternalRef("02-1-26#con espacio")).toBeNull();
    expect(parseExternalRef("02-1-26#a#b")).toBeNull();
    expect(parseExternalRef(`02-1-26#${"9".repeat(31)}`)).toBeNull(); // demasiado largo
  });

  it("mapea los cuatro países", () => {
    expect(parseExternalRef("02-1-26")?.pais).toBe("CO");
    expect(parseExternalRef("03-1-26")?.pais).toBe("EC");
    expect(parseExternalRef("04-1-26")?.pais).toBe("PE");
  });

  it("rechaza formato inválido", () => {
    expect(parseExternalRef("M5-00123-26")).toBeNull();
    expect(parseExternalRef("1-16016-26")).toBeNull(); // prefijo de 1 díg
    expect(parseExternalRef("05-16016-26")).toBeNull(); // país inexistente
    expect(parseExternalRef("01-16016-2026")).toBeNull(); // año de 4 díg
    expect(parseExternalRef("01-abc-26")).toBeNull();
  });

  it("valida OK cuando el prefijo coincide con el país", () => {
    expect(() => validarExternalRef("01-16016-26", "CL")).not.toThrow();
    expect(() => validarExternalRef("02-9-26", "CO")).not.toThrow();
  });

  it("rechaza cuando el prefijo NO coincide con el país del contrato", () => {
    expect(() => validarExternalRef("02-16016-26", "CL")).toThrow(ValidationError);
  });

  it("rechaza formato inválido con ValidationError", () => {
    expect(() => validarExternalRef("XX-1-1", "CL")).toThrow(ValidationError);
  });
});
