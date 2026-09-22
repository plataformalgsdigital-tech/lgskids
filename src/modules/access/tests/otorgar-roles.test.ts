import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/platform/errors";
import { AccessProfile } from "../application/profile";
import { requisitoParaGestionarCuenta, requisitoParaOtorgar } from "../domain/permisos";

const perfil = (rol: string, permisos: string[]) =>
  new AccessProfile({
    roles: [{ roleCode: rol, countryCode: null }],
    permissions: permisos.map((code) => ({ code, countryCode: null })),
  });

// Como en la matriz real: el coordinador gestiona usuarios pero NO asigna roles;
// el admin tiene todos los permisos pero NO el rol superadmin.
const coordinador = perfil("coordinador", ["usuarios.gestionar"]);
const admin = perfil("admin", ["usuarios.gestionar", "roles.asignar"]);
const superadmin = perfil("superadmin", ["usuarios.gestionar", "roles.asignar"]);

describe("quién puede otorgar qué rol", () => {
  it("la regla por rol", () => {
    expect(requisitoParaOtorgar("superadmin")).toBe("superadmin");
    expect(requisitoParaOtorgar("guia")).toBe("usuarios.gestionar");
    expect(requisitoParaOtorgar("admin")).toBe("roles.asignar");
    expect(requisitoParaOtorgar("coordinador")).toBe("roles.asignar");
    expect(requisitoParaOtorgar("rol-creado-en-el-panel")).toBe("roles.asignar");
  });

  it("un coordinador da de alta GUÍAS, pero ya no puede fabricarse un admin", () => {
    expect(() => coordinador.requirePuedeOtorgarRol("guia")).not.toThrow();
    expect(() => coordinador.requirePuedeOtorgarRol("admin")).toThrow(ForbiddenError);
    expect(() => coordinador.requirePuedeOtorgarRol("superadmin")).toThrow(ForbiddenError);
  });

  it("un admin otorga roles, pero NO la llave maestra: eso solo lo hace otro superadmin", () => {
    expect(() => admin.requirePuedeOtorgarRol("coordinador")).not.toThrow();
    expect(() => admin.requirePuedeOtorgarRol("superadmin")).toThrow(ForbiddenError);
    expect(() => superadmin.requirePuedeOtorgarRol("superadmin")).not.toThrow();
  });

  it("esSuperadmin mira el ROL, no los permisos: el admin los tiene todos y aun así no lo es", () => {
    expect(admin.esSuperadmin).toBe(false);
    expect(superadmin.esSuperadmin).toBe(true);
  });
});

describe("quién administra la cuenta de quién (clave, 'debe cambiar clave')", () => {
  it("hace falta tanto como para otorgar su rol más alto", () => {
    expect(requisitoParaGestionarCuenta(["alumno"])).toBe("usuarios.gestionar");
    expect(requisitoParaGestionarCuenta(["guia"])).toBe("usuarios.gestionar");
    expect(requisitoParaGestionarCuenta(["guia", "coordinador"])).toBe("roles.asignar");
    expect(requisitoParaGestionarCuenta(["admin"])).toBe("roles.asignar");
    expect(requisitoParaGestionarCuenta(["superadmin"])).toBe("superadmin");
  });

  it("un coordinador no puede restablecer la clave de un admin (y entrar como él)", () => {
    expect(() => coordinador.requirePuedeGestionarCuentaDe(["alumno"])).not.toThrow();
    expect(() => coordinador.requirePuedeGestionarCuentaDe(["admin"])).toThrow(ForbiddenError);
    expect(() => admin.requirePuedeGestionarCuentaDe(["superadmin"])).toThrow(ForbiddenError);
    expect(() => superadmin.requirePuedeGestionarCuentaDe(["superadmin"])).not.toThrow();
  });
});
