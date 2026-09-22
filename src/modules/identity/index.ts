/**
 * Módulo `identity` — API PÚBLICA.
 *
 * Autenticación, sesiones, credenciales. Login por username autogenerado (no por correo); correo sintético interno para hermanos que comparten email.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
  changePasswordHandler,
} from "./api/handlers";
export { bootstrapIdentity } from "./infrastructure/authenticator";
export { sessionService } from "./infrastructure/composition";
export { validarPassword, PASSWORD_MIN_LENGTH } from "./domain/password-policy";
export {
  provisionarUsuarioAlumno,
  inactivarUsuarioTx,
  reactivarUsuarioTx,
} from "./application/provisionar-alumno";
export type { AlumnoProvisionado } from "./application/provisionar-alumno";
export { baseUsername, correoSintetico } from "./domain/username";
export { listarUsuarios, listarGuias, TIPOS_USUARIO } from "./application/listar-usuarios";
export type { UsuarioListItem, GuiaListItem, TipoUsuario } from "./application/listar-usuarios";
export { crearUsuarioStaff, crearCuentaStaffTx } from "./application/crear-usuario";
export type { DatosCuentaStaff } from "./application/crear-usuario";
export type { CuentaCreada } from "./application/alta-cuenta";
export {
  usuarioCrearHandler,
  usuariosListarHandler,
  usuarioActualizarHandler,
  usuarioEliminarHandler,
  usuarioRestablecerClaveHandler,
  usuarioConsultarClaveHandler,
  olvidoClaveHandler,
  solicitudesClaveListarHandler,
  solicitudClaveDescartarHandler,
} from "./api/cuentas-handlers";
export { generarPasswordInicial } from "./domain/credenciales";
