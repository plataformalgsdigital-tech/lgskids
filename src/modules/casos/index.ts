/**
 * Módulo `casos` — API PÚBLICA.
 *
 * Casos de atención (2026-10-14): el guía reporta desde la sesión ("Requiere
 * atención"), Servicio asigna el caso a un área, el área contacta a la familia,
 * registra el acuerdo y lo cierra. Réplica del proceso de MOSAICO ajustada a
 * KIDS (ver `domain/casos.ts`).
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {
  casosAbiertosDeNino,
  reportarCaso,
  exigirReporteDesdeSesion,
  reportesDeSesion,
  asignarCaso,
  cerrarCaso,
  guardarGestion,
  agregarContacto,
  agregarNota,
  bandejaCasos,
  casosDeNino,
  detalleCaso,
  VISTAS,
} from "./application/casos";
export type {
  CasoAbierto,
  ReporteCreado,
  FilaCaso,
  DetalleCaso,
  EventoSeguimiento,
  Vista,
  FiltrosBandeja,
} from "./application/casos";
export {
  TEMAS,
  ETIQUETA_TEMA,
  AREAS,
  ETIQUETA_AREA,
  ESTADOS,
  ETIQUETA_ESTADO,
  ESTADOS_QUE_CIERRAN,
  CIERRES_POR_AREA,
  AREA_DE_ESCALAMIENTO,
  CANALES,
  RESULTADOS,
  ETIQUETA_RESULTADO,
  ORIGENES,
  cierraElCaso,
  problemaTransicion,
} from "./domain/casos";
export type { Tema, Area, Estado, Canal, Resultado, Origen, Reincidencia } from "./domain/casos";
