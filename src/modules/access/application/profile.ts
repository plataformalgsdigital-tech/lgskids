import { ForbiddenError } from "@/platform/errors";
import {
  PERMISOS,
  ROLES,
  requisitoParaGestionarCuenta,
  requisitoParaOtorgar,
  type RequisitoOtorgar,
} from "../domain/permisos";
import type { AccessProfileData, PermissionGrant, RoleAssignment } from "./ports";

/**
 * Perfil de acceso de un usuario: roles y permisos con alcance por país.
 *
 * REGLA (sección 7): esta verificación se ejecuta en el SERVIDOR, endpoint
 * por endpoint. Los guardas de interfaz son solo cosmética.
 */
export class AccessProfile {
  constructor(private readonly data: AccessProfileData) {}

  get roles(): RoleAssignment[] {
    return this.data.roles;
  }

  get permissions(): PermissionGrant[] {
    return this.data.permissions;
  }

  get roleCodes(): string[] {
    return [...new Set(this.data.roles.map((r) => r.roleCode))];
  }

  /**
   * Países visibles: null = alcance global (algún rol sin país);
   * lista = solo esos países.
   */
  get countryScope(): string[] | null {
    if (this.data.roles.length === 0) return [];
    if (this.data.roles.some((r) => r.countryCode === null)) return null;
    return [...new Set(this.data.roles.map((r) => r.countryCode as string))];
  }

  /**
   * ¿Tiene el permiso? Si se pasa `countryCode`, el permiso debe ser global
   * o estar otorgado para ese país.
   */
  hasPermission(code: string, countryCode?: string): boolean {
    return this.data.permissions.some((grant) => {
      if (grant.code !== code) return false;
      if (grant.countryCode === null) return true; // global cubre todo
      if (countryCode === undefined) return true; // sin país exigido
      return grant.countryCode === countryCode;
    });
  }

  /** Lanza ForbiddenError si falta el permiso. */
  requirePermission(code: string, countryCode?: string): void {
    if (!this.hasPermission(code, countryCode)) {
      throw new ForbiddenError("No tienes permiso para esta operación.", {
        details: { permiso: code, ...(countryCode !== undefined && { pais: countryCode }) },
      });
    }
  }

  /**
   * ¿Tiene el ROL superadmin? No es lo mismo que tener todos los permisos: un
   * admin también los tiene, y lo que es solo del superadmin (otorgar la llave
   * maestra, consultar claves) se decide por el ROL, que ningún permiso editable
   * en el panel puede conceder.
   */
  get esSuperadmin(): boolean {
    return this.roleCodes.includes(ROLES.SUPERADMIN);
  }

  private cumple(requisito: RequisitoOtorgar): boolean {
    if (requisito === "superadmin") return this.esSuperadmin;
    if (requisito === "roles.asignar") return this.hasPermission(PERMISOS.ROLES_ASIGNAR);
    return this.hasPermission(PERMISOS.USUARIOS_GESTIONAR);
  }

  /** Lanza si no puede otorgar ese rol (ver `requisitoParaOtorgar`). */
  requirePuedeOtorgarRol(roleCode: string): void {
    const requisito = requisitoParaOtorgar(roleCode);
    if (!this.cumple(requisito)) {
      throw new ForbiddenError(`No puedes otorgar el rol '${roleCode}'.`, {
        details: { requiere: requisito },
      });
    }
  }

  /** Lanza si no puede administrar la cuenta de alguien con esos roles. */
  requirePuedeGestionarCuentaDe(rolesDelOtro: readonly string[]): void {
    const requisito = requisitoParaGestionarCuenta(rolesDelOtro);
    if (!this.cumple(requisito)) {
      throw new ForbiddenError("No puedes administrar la cuenta de este usuario.", {
        details: { requiere: requisito },
      });
    }
  }
}
