/**
 * Módulo `access` — API PÚBLICA.
 *
 * Roles, permisos, RBAC con alcance por país (CL/CO/EC/PE). La autorización se ejecuta en el servidor, endpoint por endpoint.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  getAccessProfile,
  invalidateAccessProfile,
  listarRoles,
} from "./application/get-access-profile";
export { AccessProfile } from "./application/profile";
export { asignarRol, asignarRolTx, quitarRol } from "./application/asignar-rol";
export { crearRol, permisosDeRol, actualizarPermisosDeRol } from "./application/gestionar-roles";
export type { PermisosDeRol } from "./application/gestionar-roles";
export {
  PERMISOS,
  ROLES,
  MATRIZ_ROL_PERMISOS,
  SECCIONES_MENU,
  requisitoParaOtorgar,
  requisitoParaGestionarCuenta,
} from "./domain/permisos";
export type { PermisoCode, RoleCode, RequisitoOtorgar } from "./domain/permisos";
export type { RoleAssignment, PermissionGrant } from "./application/ports";
