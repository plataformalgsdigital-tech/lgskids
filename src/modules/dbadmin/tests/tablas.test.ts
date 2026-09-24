import { describe, expect, it } from "vitest";
import { ValidationError } from "@/platform/errors";
import {
  TAMANO_PAGINA_MAXIMO,
  citar,
  esColumnaOculta,
  esTablaSensible,
  identificadorValido,
  motivoSensible,
  tamanoPagina,
} from "../domain/tablas";

/**
 * Estas reglas son lo único que separa un explorador de tablas de una fuga y
 * de una inyección: los identificadores no pueden ir parametrizados, así que
 * se validan aquí antes de entrar al SQL.
 */
describe("identificadores", () => {
  it("acepta los nombres que usa el proyecto", () => {
    for (const n of ["identity_user", "catalog_curso", "_prisma_migrations", "id"]) {
      expect(identificadorValido(n)).toBe(true);
    }
  });

  it("rechaza lo que intentaría salirse del nombre", () => {
    for (const n of [
      'usuarios"; DROP TABLE identity_user; --',
      "identity_user; DELETE FROM x",
      "tabla con espacios",
      "Tabla",
      "tabla-guion",
      "",
      "'",
      "a".repeat(64),
    ]) {
      expect(identificadorValido(n)).toBe(false);
      expect(() => citar(n)).toThrow(ValidationError);
    }
  });

  it("citar deja el nombre entre comillas dobles", () => {
    expect(citar("catalog_curso")).toBe('"catalog_curso"');
  });
});

describe("columnas que no se muestran", () => {
  it("las credenciales quedan fuera, por nombre exacto", () => {
    expect(esColumnaOculta("identity_user", "password_hash")).toBe(true);
    expect(esColumnaOculta("identity_user", "password_cifrada")).toBe(true);
    expect(esColumnaOculta("identity_refresh_token", "token_hash")).toBe(true);
    expect(esColumnaOculta("scheduling_guia_invitacion", "token_hash")).toBe(true);
  });

  it("y también lo que tenga pinta de secreto en cualquier tabla", () => {
    // Red para la columna que alguien agregue mañana sin tocar esta lista.
    expect(esColumnaOculta("tabla_nueva", "api_token")).toBe(true);
    expect(esColumnaOculta("tabla_nueva", "clave_cifrada")).toBe(true);
    expect(esColumnaOculta("tabla_nueva", "algo_hash")).toBe(true);
  });

  it("lo normal sí se ve", () => {
    expect(esColumnaOculta("identity_user", "username")).toBe(false);
    expect(esColumnaOculta("people_person", "nombres")).toBe(false);
  });
});

describe("tablas que piden confirmación", () => {
  it("las derivadas y la evidencia", () => {
    for (const t of [
      "progression_award",
      "attendance_attendance",
      "assessment_attempt",
      "enrollment_enrollment",
      "audit_log",
      "_prisma_migrations",
    ]) {
      expect(esTablaSensible(t)).toBe(true);
      expect(motivoSensible(t)).toBeTruthy();
    }
  });

  it("una tabla de configuración se escribe sin ceremonia", () => {
    expect(esTablaSensible("catalog_curso")).toBe(false);
    expect(motivoSensible("catalog_curso")).toBeNull();
  });
});

describe("tamaño de página", () => {
  it("acota lo que pida el cliente", () => {
    expect(tamanoPagina(10)).toBe(10);
    expect(tamanoPagina(100000)).toBe(TAMANO_PAGINA_MAXIMO);
    expect(tamanoPagina(0)).toBe(1);
    expect(tamanoPagina(-5)).toBe(1);
    expect(tamanoPagina(undefined)).toBe(50);
    expect(tamanoPagina(Number.NaN)).toBe(50);
  });
});
