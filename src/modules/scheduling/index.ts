/**
 * Módulo `scheduling` — API PÚBLICA.
 *
 * Salón (horario recurrente, guía, cupo, enlace, zona operativa y calendario de feriados configurables por salón), generación de sesiones, feriados por país, suspensiones persistidas en tabla. finalCurso NUNCA se reescribe.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  crearSalon,
  regenerarSesiones,
  suspenderDia,
  sincronizarFeriados,
  listarSalones,
  detalleSalon,
  editarSalon,
  eliminarSalon,
  generarSalonesDesdeCatalogo,
  agenda,
  obtenerDetalleSesion,
  cambiarGuia,
} from "./application/gestion-salones";
export type { SlotInput, DetalleSalon } from "./application/gestion-salones";
export {
  crearHorario,
  actualizarHorario,
  eliminarHorario,
  listarHorarios,
  cambiarActivoHorario,
} from "./application/horarios-catalogo";
export { misNinosDeGuia } from "./application/gestion-salones";
export type {
  AgendaItem,
  SesionDetalle,
  HorarioCatalogoRecord,
  HorarioSlotInput,
  ClassroomListItem,
  NinoDeGuia,
  SalonCampania,
} from "./infrastructure/scheduling-repository";
export {
  crearSalonHandler,
  listarSalonesHandler,
  detalleSalonHandler,
  editarSalonHandler,
  eliminarSalonHandler,
  generarSalonesHandler,
  regenerarHandler,
  suspenderHandler,
  agendaHandler,
  detalleSesionHandler,
  cambiarGuiaHandler,
  listarHorariosHandler,
  crearHorarioHandler,
  actualizarHorarioHandler,
  eliminarHorarioHandler,
  toggleHorarioHandler,
  agendaGuiaHandler,
  misSalonesHandler,
  misNinosHandler,
} from "./api/handlers";
export { feriadosDelPais, domingoPascua } from "./domain/feriados";
export type { Feriado } from "./domain/feriados";

export {
  cerrarSesion,
  reabrirSesion,
  solicitarRepeticion,
  resolverRepeticion,
  repeticionesDeSesion,
  listarRefuerzos,
} from "./application/registro-sesion";
export type { RegistroSesion, Repeticion, FilaRefuerzo } from "./application/registro-sesion";
export {
  crearEvento,
  guiasConZoom,
  guardarFichaGuia,
  fichasDeGuias,
  MAX_SALONES_COMPARTIDOS,
  DURACIONES_TALLER,
} from "./application/crear-evento";
export { crearGuia, MIMES_FOTO_GUIA } from "./application/alta-guia";
export type { DatosAltaGuia } from "./application/alta-guia";
export {
  getRegistroAbierto,
  setRegistroAbierto,
  estadoPublicoRegistro,
  registrarGuiaAbierto,
  enlaceRegistroAbierto,
  MAX_REGISTROS_POR_IP_HORA,
} from "./application/registro-abierto";
export type { RegistroAbierto } from "./application/registro-abierto";
export {
  crearEventoAdmin,
  eventosAdmin,
  audienciaEventoAdmin,
  marcarAsistenciaEventoAdmin,
} from "./application/crear-evento";
export type { AsistenteEventoAdmin } from "./application/crear-evento";
export type {
  TipoEvento,
  EventoCreado,
  GuiaConZoom,
  FichaGuia,
  EventoAdmin,
  EventoAdminCreado,
} from "./application/crear-evento";
export {
  crearInvitacionGuia,
  revocarInvitacionGuia,
  enlacesDeGuias,
  fichaPorInvitacion,
  completarInvitacionGuia,
} from "./application/invitacion-guia";
export type {
  InvitacionEmitida,
  EstadoEnlaceGuia,
  FichaPrellenada,
  DatosWizard,
} from "./application/invitacion-guia";
export {
  TIPOS_EVENTO_ADMIN,
  CODIGOS_EVENTO_ADMIN,
  DURACION_ADMIN_MIN,
  DURACION_ADMIN_MAX,
  etiquetaEventoAdmin,
} from "./domain/evento-admin";
export type { TipoEventoAdmin } from "./domain/evento-admin";
export { DIAS_VIGENCIA_INVITACION } from "./domain/invitacion";
export type { EstadoInvitacion } from "./domain/invitacion";
