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
  avisoLoginPublicoHandler,
  avisoLoginImagenHandler,
  avisoLoginEstadoHandler,
  avisoLoginActivarHandler,
  hotspotsInfoHandler,
  hotspotsGuardarHandler,
  materialEstadoHandler,
  materialSubirHandler,
  materialEliminarHandler,
  materialVerHandler,
  respuestaMaterial,
} from "./api/handlers";
export {
  archivoDeMaterial,
  materialVigente,
  TIPOS_MATERIAL,
  TAMANO_MAXIMO_MATERIAL,
} from "./application/material";
export type {
  ArchivoMaterial,
  CasillaUnidad,
  MaterialResumen,
  MaterialTipo,
  MaterialNivel,
} from "./application/material";
export {
  SANDBOX_LIBRO,
  PREFIJO_NOMBRE_LIBRO,
  MENSAJE_ALMACEN_LIBRO,
  CLAVE_AUTORIZACIONES_LIBRO,
  valorAutorizacionesLibro,
} from "./domain/libro-interactivo";
export {
  autorizarMisiones,
  autorizacionParaLibro,
  misionesAutorizadas,
  misionesDeNinos,
  nivelDeNino,
  revocarMision,
} from "./application/misiones";
export type { MisionAutorizada, NivelDeNino, ResultadoAutorizacion } from "./application/misiones";
export {
  videosLibroListarHandler,
  videosLibroSubirHandler,
  videoLibroConfirmarHandler,
  videoLibroEliminarHandler,
  videoLibroPrevioHandler,
  videoLibroServirHandler,
} from "./api/video-handlers";
export { baseVideosLibro } from "./application/video-libro";
export type { VideoLibro } from "./application/video-libro";
export { rutaVideoLibro } from "./domain/video-libro";
export { getHotspotsCurso } from "./application/hotspots";
export type { HotspotData, Punto, HotspotScope } from "./application/hotspots";
export {
  imagenCursoId,
  imagenCursoIdResuelto,
  premioNivelId,
  mapaCursoId,
  voboId,
  NIVEL_TODOS,
  UNIDADES_POR_NIVEL,
  imagenesUnidadNivel,
} from "./application/imagen-curso";
export {
  juegosDeUnidad,
  juegosDeNivel,
  leccionesSinCasilla,
  guardarPosicionesUnidad,
} from "./application/unidad-juegos";
export { ANCHO_ZONA, ALTO_ZONA } from "./application/unidad-juegos";
export type { Juego, Posicion, LeccionSinCasilla } from "./application/unidad-juegos";
export {
  PARADAS,
  PARADAS_MAPA,
  PARADA_WELCOME,
  UNIDADES_MAPA,
  etiquetaParada,
  paradaValida,
  todasLasUnidades,
  unidadMapa,
} from "./domain/unidad-mapa";
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
