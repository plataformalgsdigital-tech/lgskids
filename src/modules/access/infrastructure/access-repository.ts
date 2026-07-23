import { newId } from "@/platform/ids";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import type { AccessProfileData, AccessRepositoryPort } from "../application/ports";

export class PgAccessRepository implements AccessRepositoryPort {
  async getProfile(userId: string): Promise<AccessProfileData> {
    const roles = await queryRows<{ role_code: string; country_code: string | null }>(
      `SELECT r.code AS role_code, ur.country_code
         FROM access_user_role ur
         JOIN access_role r ON r.id = ur.role_id
        WHERE ur.user_id = $1`,
      [userId],
    );
    const permissions = await queryRows<{ code: string; country_code: string | null }>(
      `SELECT DISTINCT p.code, ur.country_code
         FROM access_user_role ur
         JOIN access_role_permission rp ON rp.role_id = ur.role_id
         JOIN access_permission p ON p.id = rp.permission_id
        WHERE ur.user_id = $1`,
      [userId],
    );
    return {
      roles: roles.map((r) => ({ roleCode: r.role_code, countryCode: r.country_code })),
      permissions: permissions.map((p) => ({ code: p.code, countryCode: p.country_code })),
    };
  }

  async findRoleIdByCode(roleCode: string): Promise<string | null> {
    const row = await queryOne<{ id: string }>(`SELECT id FROM access_role WHERE code = $1`, [
      roleCode,
    ]);
    return row?.id ?? null;
  }

  async countryExists(countryCode: string): Promise<boolean> {
    const row = await queryOne<{ code: string }>(
      `SELECT code FROM access_country WHERE code = $1`,
      [countryCode],
    );
    return row !== null;
  }

  async hasGlobalAssignment(userId: string, roleId: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM access_user_role
        WHERE user_id = $1 AND role_id = $2 AND country_code IS NULL`,
      [userId, roleId],
    );
    return row !== null;
  }

  async assignRole(userId: string, roleId: string, countryCode: string | null): Promise<void> {
    await execute(
      `INSERT INTO access_user_role (id, user_id, role_id, country_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, role_id, country_code) DO NOTHING`,
      [newId(), userId, roleId, countryCode],
    );
  }

  async listRoles(): Promise<{ code: string; nombre: string; descripcion: string | null }[]> {
    return queryRows(`SELECT code, nombre, descripcion FROM access_role ORDER BY code`);
  }
}
