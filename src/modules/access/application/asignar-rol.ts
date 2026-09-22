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

/**
 * QUITA un rol (con el mismo alcance con que se dio). Quién puede quitar
 * cuál lo decide la ruta, con la misma regla que para otorgarlo. Aquí solo lo
 * que NINGÚN actor puede hacer:
 * - quitarse roles a sí mismo (así nadie se deja sin acceso por error);
 * - quitar el rol de alumno: lo pone el alta única del contrato (regla 5);
 * - dejar la plataforma sin superadmin ACTIVO: la llave maestra no se pierde.
 */
export async function quitarRol(input: {
  actorUserId: string;
  userId: string;
  roleCode: string;
  countryCode: string | null;
  ip?: string | null;
}): Promise<void> {
  if (input.actorUserId === input.userId) {
    throw new ValidationError("No puedes quitarte roles a ti mismo.");
  }
  if (input.roleCode === "alumno") {
    throw new ConflictError(
      "El rol de alumno lo pone el contrato: la cuenta se apaga al vencer o inactivarlo.",
    );
  }
  if (input.roleCode === "superadmin") {
    const otros = await queryOne<{ n: number }>(
      `SELECT count(DISTINCT ur.user_id)::int AS n
         FROM access_user_role ur
         JOIN access_role r ON r.id = ur.role_id
         JOIN identity_user u ON u.id = ur.user_id
        WHERE r.code = 'superadmin' AND u.estado = 'ACTIVO' AND ur.user_id <> $1`,
      [input.userId],
    );
    if ((otros?.n ?? 0) === 0) {
      throw new ConflictError(
        "Es el último superadmin activo: la llave maestra no se puede perder.",
      );
    }
  }
  const quitadas = await execute(
    `DELETE FROM access_user_role ur
      USING access_role r
      WHERE r.id = ur.role_id AND ur.user_id = $1 AND r.code = $2
        AND ur.country_code IS NOT DISTINCT FROM $3`,
    [input.userId, input.roleCode, input.countryCode],
  );
  if (quitadas === 0) throw new NotFoundError("El usuario no tiene ese rol con ese alcance.");
  invalidateAccessProfile(input.userId);

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "access.rol_quitado",
    entidad: "identity_user",
    entidadId: input.userId,
    payload: { rol: input.roleCode, pais: input.countryCode },
    ip: input.ip ?? null,
  });
}
