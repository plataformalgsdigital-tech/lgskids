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
  referenciaNivelGetHandler,
  referenciaNivelPutHandler,
  referenciaQuizGetHandler,
  referenciaQuizPutHandler,
  cursoReferenciaListHandler,
  cursoReferenciaCrearHandler,
  cursoReferenciaBulkHandler,
  cursoReferenciaGetHandler,
  cursoReferenciaPutHandler,
  cursoReferenciaDeleteHandler,
  imagenCursoSubirHandler,
  imagenCursoInfoHandler,
  imagenCursoServeHandler,
} from "./api/handlers";
export { imagenCursoId } from "./application/imagen-curso";
export {
  obtenerReferenciaNivel,
  actualizarReferenciaNivel,
  obtenerReferenciaQuiz,
  actualizarReferenciaQuiz,
} from "./application/referencia-curricular";
export type { ReferenciaNivel, ReferenciaQuiz } from "./application/referencia-curricular";
export {
  listarCursoReferencia,
  obtenerCursoReferencia,
  crearCursoReferencia,
  actualizarCursoReferencia,
  eliminarCursoReferencia,
  importarCursoReferencia,
} from "./application/curso-referencia";
export type { CursoReferenciaRow } from "./application/curso-referencia";
export { crearCampania } from "./application/crear-campania";
export { derivarEstadoCampania, ETIQUETA_ESTADO } from "./domain/campania";
export type { EstadoCampania } from "./domain/campania";
export { NIVELES, LECCIONES_POR_NIVEL, TIPOS_CURSO } from "./domain/curriculo";
export type { NivelCodigo, CursoTipo } from "./domain/curriculo";
export type { CampaignListItem, CampaignDetail } from "./application/ports";
export { cuestionariosDeCurso, listarCampanias, detalleCampania } from "./application/consultas";
