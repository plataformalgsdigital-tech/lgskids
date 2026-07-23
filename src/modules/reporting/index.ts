/**
 * Módulo `reporting` — API PÚBLICA.
 *
 * Informes, exportaciones, tableros. Agrupación temporal SIEMPRE en SQL con AT TIME ZONE.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {};
