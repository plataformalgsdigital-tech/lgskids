import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { NotFoundError, ValidationError, ConflictError } from "@/platform/errors";
import { accessRepository, invalidateAccessProfile } from "./get-access-profile";

/**
 * Asigna un rol a un usuario, con alcance global (countryCode null) o por
 * país. Operación crítica: queda auditada.
 */
/**
 * Variante TRANSACCIONAL para composición entre módulos (ej. el alta única
 * del alumno al aprobar un contrato): asigna el rol DENTRO de la transacción
 * recibida. La auditoría la registra la operación orquestadora.
 */
export async function asignarRolTx(
  tx: Pick<PoolClient, "query">,
  input: { userId: string; roleCode: string; countryCode: string | null },
): Promise<void> {
  const role = await queryOne<{ id: string }>(
    `SELECT id FROM access_role WHERE code = $1`,
    [input.roleCode],
    tx,
  );
  if (role === null) {
    throw new NotFoundError(`El rol '${input.roleCode}' no existe.`);
  }
  await execute(
    `INSERT INTO access_user_role (id, user_id, role_id, country_code)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, role_id, country_code) DO NOTHING`,
    [newId(), input.userId, role.id, input.countryCode],
    tx,
  );
  invalidateAccessProfile(input.userId);
}

export async function asignarRol(input: {
  actorUserId: string;
  userId: string;
  roleCode: string;
  countryCode: string | null;
  ip?: string | null;
}): Promise<void> {
  const repo = accessRepository();

  const roleId = await repo.findRoleIdByCode(input.roleCode);
  if (roleId === null) {
    throw new NotFoundError(`El rol '${input.roleCode}' no existe.`);
  }
  if (input.countryCode !== null) {
    const existe = await repo.countryExists(input.countryCode);
    if (!existe) {
      throw new ValidationError(`El país '${input.countryCode}' no existe.`);
    }
  }
  // El UNIQUE de Postgres no cubre country NULL duplicado: se controla aquí.
  if (input.countryCode === null) {
    const yaGlobal = await repo.hasGlobalAssignment(input.userId, roleId);
    if (yaGlobal) {
      throw new ConflictError("El usuario ya tiene ese rol con alcance global.");
    }
  }

  await repo.assignRole(input.userId, roleId, input.countryCode);
  invalidateAccessProfile(input.userId);

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "access.rol_asignado",
    entidad: "identity_user",
    entidadId: input.userId,
    payload: { rol: input.roleCode, pais: input.countryCode },
    ip: input.ip ?? null,
  });
}
