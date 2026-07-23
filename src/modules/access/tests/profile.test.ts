import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/platform/errors";
import { AccessProfile } from "../application/profile";

describe("AccessProfile — alcance por país (ADR-0009)", () => {
  const perfilChile = new AccessProfile({
    roles: [{ roleCode: "coordinador", countryCode: "CL" }],
    permissions: [
      { code: "usuarios.gestionar", countryCode: "CL" },
      { code: "auditoria.ver", countryCode: "CL" },
    ],
  });

  const perfilGlobal = new AccessProfile({
    roles: [{ roleCode: "admin", countryCode: null }],
    permissions: [{ code: "usuarios.gestionar", countryCode: null }],
  });

  it("permiso por país aplica a su país", () => {
    expect(perfilChile.hasPermission("usuarios.gestionar", "CL")).toBe(true);
  });

  it("permiso por país NO aplica a otro país", () => {
    expect(perfilChile.hasPermission("usuarios.gestionar", "CO")).toBe(false);
  });

  it("permiso global cubre cualquier país", () => {
    expect(perfilGlobal.hasPermission("usuarios.gestionar", "PE")).toBe(true);
  });

  it("countryScope null para roles globales, lista para roles por país", () => {
    expect(perfilGlobal.countryScope).toBeNull();
    expect(perfilChile.countryScope).toEqual(["CL"]);
  });

  it("requirePermission lanza ForbiddenError con el detalle", () => {
    expect(() => perfilChile.requirePermission("roles.asignar")).toThrow(ForbiddenError);
  });

  it("sin roles: alcance vacío y sin permisos", () => {
    const vacio = new AccessProfile({ roles: [], permissions: [] });
    expect(vacio.countryScope).toEqual([]);
    expect(vacio.hasPermission("panel.alumno")).toBe(false);
  });
});
