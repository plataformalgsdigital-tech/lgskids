/**
 * Módulo `reporting` — API PÚBLICA.
 *
 * Informes, exportaciones, tableros. Agrupación temporal SIEMPRE en SQL con AT TIME ZONE.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export { asistenciaPorSalonMes, ocupacionSalones, contratosPorPais } from "./application/reportes";
export type { AsistenciaSalonMes, OcupacionSalon, ContratosPais } from "./application/reportes";
export {
  resumenTablero,
  salonesSinGuia,
  clasesDeHoy,
  sesionesSinMarcar,
  resumenGuia,
} from "./application/tablero";
export type {
  ResumenTablero,
  SalonSinGuia,
  ClaseDeHoy,
  SesionSinMarcar,
  ResumenGuia,
} from "./application/tablero";
export { calcularGuiaMes, consolidarGuiaMes, leerGuiaMes } from "./application/guia-mes";
export type { GuiaMes } from "./application/guia-mes";
