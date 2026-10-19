/**
 * Módulo `intake` — API PÚBLICA (Fase B).
 *
 * Puerta de SERVICIO (máquina-a-máquina) para que LGS consulte disponibilidad,
 * cree la reserva de un beneficiario y dispare su aprobación en KIDS. Se
 * autentica por API-key (handlerWithServiceAuth), no por usuario final.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo.
 */
export { disponibilidad } from "./application/disponibilidad";
export type {
  CampaniaDisponible,
  CursoDisponible,
  SalonDisponible,
} from "./application/disponibilidad";
export type { CampaniaRoster, CursoRoster, SalonRoster } from "./application/roster";
export {
  disponibilidadHandler,
  rosterIntakeHandler,
  reservarIntakeHandler,
  aprobarIntakeHandler,
  suspenderIntakeHandler,
  bajaIntakeHandler,
  reactivarIntakeHandler,
  pausarIntakeHandler,
  finPausaIntakeHandler,
  extenderIntakeHandler,
  apoderadoIntakeHandler,
  estadoAcademicoIntakeHandler,
} from "./api/handlers";
