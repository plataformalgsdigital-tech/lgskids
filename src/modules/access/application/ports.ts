/** PUERTOS del módulo access. */

export interface RoleAssignment {
  roleCode: string;
  /** null = alcance global. */
  countryCode: string | null;
}

export interface PermissionGrant {
  code: string;
  /** null = válido en todos los países. */
  countryCode: string | null;
}

export interface AccessProfileData {
  roles: RoleAssignment[];
  permissions: PermissionGrant[];
}

export interface AccessRepositoryPort {
  getProfile(userId: string): Promise<AccessProfileData>;
  findRoleIdByCode(roleCode: string): Promise<string | null>;
  countryExists(countryCode: string): Promise<boolean>;
  hasGlobalAssignment(userId: string, roleId: string): Promise<boolean>;
  assignRole(userId: string, roleId: string, countryCode: string | null): Promise<void>;
  listRoles(): Promise<{ code: string; nombre: string; descripcion: string | null }[]>;
}
