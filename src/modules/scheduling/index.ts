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
  agenda,
  obtenerDetalleSesion,
  cambiarGuia,
} from "./application/gestion-salones";
export type { SlotInput, DetalleSalon } from "./application/gestion-salones";
export {
  crearHorario,
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
} from "./infrastructure/scheduling-repository";
export {
  crearSalonHandler,
  listarSalonesHandler,
  detalleSalonHandler,
  regenerarHandler,
  suspenderHandler,
  agendaHandler,
  detalleSesionHandler,
  cambiarGuiaHandler,
  listarHorariosHandler,
  crearHorarioHandler,
  toggleHorarioHandler,
  agendaGuiaHandler,
  misSalonesHandler,
  misNinosHandler,
} from "./api/handlers";
export { feriadosDelPais, domingoPascua } from "./domain/feriados";
export type { Feriado } from "./domain/feriados";
