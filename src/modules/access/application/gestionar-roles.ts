import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { ROLES } from "../domain/permisos";
import { accessRepository, invalidateAllProfiles } from "./get-access-profile";
import {
  getPermissionsCatalog,
  getRolePermissionCodes,
  insertRole,
  replaceRolePermissions,
} from "../infrastructure/access-repository";

/**
 * Gestión de ROLES y sus PERMISOS (pedido funcional 2026-07-23): un rol es
 * un conjunto de permisos marcados; ej. un rol "Consulta" solo con permisos
 * *.ver, mientras admin tiene también *.gestionar.
 *
 * REGLA: el rol `superadmin` es INTOCABLE — siempre tiene todos los
 * permisos (el seed lo garantiza) y aquí se rechaza cualquier edición.
 */

function slugDeNombre(nombre: string): string {
  const slug = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (slug.length < 3 || slug.length > 30) {
    throw new ValidationError("El nombre del rol debe generar un código de 3 a 30 caracteres.");
  }
  return slug;
}

export async function crearRol(input: {
  actorUserId: string;
  nombre: string;
  descripcion?: string | null;
  ip?: string | null;
}): Promise<{ code: string }> {
  const nombre = input.nombre.trim();
  if (nombre.length < 3 || nombre.length > 40) {
    throw new ValidationError("El nombre del rol debe tener entre 3 y 40 caracteres.");
  }
  const code = slugDeNombre(nombre);
  const existente = await accessRepository().findRoleIdByCode(code);
  if (existente !== null) {
    throw new ConflictError(`Ya existe un rol con el código '${code}'.`);
  }
  await insertRole(code, nombre, input.descripcion?.trim() || null);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "access.rol_creado",
    entidad: "access_role",
    entidadId: code,
    payload: { nombre },
    ip: input.ip ?? null,
  });
  return { code };
}

export interface PermisosDeRol {
  rol: string;
  editable: boolean;
  catalogo: { code: string; nombre: string; asignado: boolean }[];
}

/** Catálogo completo con marca de cuáles tiene el rol. */
export async function permisosDeRol(roleCode: string): Promise<PermisosDeRol> {
  const roleId = await accessRepository().findRoleIdByCode(roleCode);
  if (roleId === null) throw new NotFoundError(`El rol '${roleCode}' no existe.`);
  const [catalogo, asignados] = await Promise.all([
    getPermissionsCatalog(),
    getRolePermissionCodes(roleCode),
  ]);
  const set = new Set(asignados);
  return {
    rol: roleCode,
    editable: roleCode !== ROLES.SUPERADMIN,
    catalogo: catalogo.map((p) => ({ ...p, asignado: set.has(p.code) })),
  };
}

/** Reemplaza los permisos del rol por los marcados. Auditado. */
export async function actualizarPermisosDeRol(input: {
  actorUserId: string;
  roleCode: string;
  permisos: string[];
  ip?: string | null;
}): Promise<void> {
  if (input.roleCode === ROLES.SUPERADMIN) {
    throw new ConflictError("El rol superadmin es la llave maestra: no se puede editar.");
  }
  const roleId = await accessRepository().findRoleIdByCode(input.roleCode);
  if (roleId === null) throw new NotFoundError(`El rol '${input.roleCode}' no existe.`);

  const catalogo = new Set((await getPermissionsCatalog()).map((p) => p.code));
  for (const permiso of input.permisos) {
    if (!catalogo.has(permiso)) {
      throw new ValidationError(`Permiso desconocido: ${permiso}.`);
    }
  }

  await withTransaction((tx) => replaceRolePermissions(tx, input.roleCode, input.permisos));
  // Los perfiles cacheados quedan obsoletos: se limpian todos (TTL corto
  // igual los vencería, pero así el cambio aplica de inmediato).
  invalidateAllProfiles();

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "access.permisos_de_rol_actualizados",
    entidad: "access_role",
    entidadId: input.roleCode,
    payload: { permisos: input.permisos },
    ip: input.ip ?? null,
  });
}
