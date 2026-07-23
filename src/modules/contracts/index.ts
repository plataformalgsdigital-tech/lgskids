/**
 * Módulo `contracts` — API PÚBLICA.
 *
 * Contrato (nace en KIDS), vigencia con finalContrato DATE puro (+2 días de gracia, UNA sola función), OnHold con extensión automática, cascada de inactivación sincronizada.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {};
