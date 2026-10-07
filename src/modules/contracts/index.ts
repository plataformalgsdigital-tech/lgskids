/**
 * Módulo `contracts` — API PÚBLICA.
 *
 * Contrato (nace en KIDS), vigencia con finalContrato DATE puro (+2 días de gracia, UNA sola función), OnHold con extensión automática, cascada de inactivación sincronizada.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  crearContrato,
  crearReservaBeneficiario,
  aprobarContrato,
  aprobarReservaPorExternalRef,
  suspenderPorExternalRef,
  reactivarPorExternalRef,
  ponerEnPausa,
  reactivar,
  inactivarContrato,
  procesarVencimientos,
  listarContratos,
  buscarContratos,
  obtenerContrato,
  fichaContrato,
  cambiarCursoContrato,
  academicoDeContrato,
} from "./application/gestion-contratos";
export type { FichaContrato } from "./application/gestion-contratos";
export {
  contratoVencido,
  fechaUtcHoy,
  finalDeContrato,
  DIAS_GRACIA_VENCIMIENTO,
  MESES_CONTRATO,
  SQL_CONTRATO_VENCIDO,
} from "./domain/vigencia";
export { edadEnFecha, validarEdadParaTipo } from "./domain/edad";
export { buscarEstudiantes } from "./application/estudiantes";
export type { EstudianteEncontrado } from "./application/estudiantes";
export { fichaAcademicaPorRef } from "./application/estado-academico";
export type { FichaAcademica } from "./application/estado-academico";
export { estadoAcademico } from "./domain/academico";
export type { EstadoAcademico, MotivoInactivo } from "./domain/academico";
export {
  buscarEstudiantesHandler,
  crearContratoHandler,
  crearReservaHandler,
  listarContratosHandler,
  fichaContratoHandler,
  cambiarCursoHandler,
  opcionesAcademicasHandler,
  aprobarContratoHandler,
  onholdHandler,
  reactivarHandler,
  inactivarHandler,
} from "./api/handlers";
