import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { PERMISOS, ROLES, SECCIONES_MENU } from "../domain/permisos";
import { accessRepository, getAccessProfile, invalidateAllProfiles } from "./get-access-profile";
import type { AccessProfile } from "./profile";
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
  /**
   * Jerarquía del menú (padre → hijos) para que la pantalla de Roles marque
   * en árbol. Viaja desde el servidor: SECCIONES_MENU es la única fuente y el
   * cliente no la vuelve a declarar.
   */
  secciones: {
    etiqueta: string;
    permiso: string;
    /** Opción del menú y, debajo, las opciones de su pantalla (3er nivel). */
    hijos: {
      etiqueta: string;
      permiso: string;
      opciones: { etiqueta: string; permiso: string }[];
    }[];
  }[];
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
    secciones: SECCIONES_MENU.map((s) => ({
      etiqueta: s.etiqueta,
      permiso: s.permiso as string,
      hijos: s.hijos.map((h) => ({
        etiqueta: h.etiqueta,
        permiso: h.permiso as string,
        opciones: h.opciones,
      })),
    })),
  };
}

/**
 * Lanza si `actor` no puede otorgar (o quitar) `roleCode`: la regla de siempre
 * (`requirePuedeOtorgarRol`) y, si el rol lleva «Ver clave», ser superadmin.
 * La usan TODAS las puertas que dan un rol.
 */
export async function exigirPuedeOtorgarRol(actor: AccessProfile, roleCode: string): Promise<void> {
  actor.requirePuedeOtorgarRol(roleCode);
  if (
    !actor.esSuperadmin &&
    (await getRolePermissionCodes(roleCode)).includes(PERMISOS.USUARIOS_VER_CLAVE)
  ) {
    throw new ForbiddenError(
      `El rol '${roleCode}' puede ver claves: solo un superadmin lo otorga o lo quita.`,
    );
  }
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
  // "Ver clave" solo lo marca o lo quita un superadmin: con `roles.asignar`
  // alguien se lo daría a su propio rol.
  const teniaVerClave = (await getRolePermissionCodes(input.roleCode)).includes(
    PERMISOS.USUARIOS_VER_CLAVE,
  );
  if (teniaVerClave !== input.permisos.includes(PERMISOS.USUARIOS_VER_CLAVE)) {
    const actor = await getAccessProfile(input.actorUserId);
    if (!actor.esSuperadmin) {
      throw new ForbiddenError("Solo un superadmin puede marcar o quitar «Ver clave» en un rol.");
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
