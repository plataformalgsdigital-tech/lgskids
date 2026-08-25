/**
 * Módulo `catalog` — API PÚBLICA.
 *
 * Campaña (global, multi-país), curso (JUNIOR 6–9 | YOUNGSTER 10–13), nivel (Rookie→Champion→Elite→Legendary), 4 lecciones por nivel con cuestionario de práctica + Level Up, material.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  crearCampaniaHandler,
  listarCampaniasHandler,
  detalleCampaniaHandler,
  actualizarCampaniaHandler,
} from "./api/handlers";
export { crearCampania } from "./application/crear-campania";
export { derivarEstadoCampania, ETIQUETA_ESTADO } from "./domain/campania";
export type { EstadoCampania } from "./domain/campania";
export { NIVELES, LECCIONES_POR_NIVEL, TIPOS_CURSO } from "./domain/curriculo";
export type { NivelCodigo, CursoTipo } from "./domain/curriculo";
export type { CampaignListItem, CampaignDetail } from "./application/ports";
export { cuestionariosDeCurso, listarCampanias, detalleCampania } from "./application/consultas";
