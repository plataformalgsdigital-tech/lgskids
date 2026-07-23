import { ForbiddenError } from "@/platform/errors";
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
}
