import { registrarAuditoria } from "@/modules/audit";
import { NotFoundError, ValidationError, ConflictError } from "@/platform/errors";
import { accessRepository, invalidateAccessProfile } from "./get-access-profile";

/**
 * Asigna un rol a un usuario, con alcance global (countryCode null) o por
 * país. Operación crítica: queda auditada.
 */
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
