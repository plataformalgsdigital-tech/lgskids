/**
 * Módulo `people` — API PÚBLICA.
 *
 * Niño, apoderado, titular; relación apoderado–niño. El titular del contrato puede diferir del apoderado. Documento único por (país, tipo, número).
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  crearAdulto,
  crearNino,
  listarPersonas,
  listarNinos,
  obtenerDetalleNino,
  obtenerPersona,
} from "./application/crear-personas";
export {
  crearAdultoHandler,
  crearNinoHandler,
  listarPersonasHandler,
  listarNinosHandler,
  detalleNinoHandler,
} from "./api/handlers";
export {
  findPersonById,
  findPersonByUserId,
  findPersonByDoc,
  insertPerson,
  insertGuardianship,
  linkUser,
  setPersonEstado,
} from "./infrastructure/person-repository";
export type { NinoListItem, NinoDetalle } from "./infrastructure/person-repository";
export type { PersonRecord, PersonInput, PersonListItem } from "./application/ports";
