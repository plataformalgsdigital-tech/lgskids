/**
 * Módulo `enrollment` — API PÚBLICA.
 *
 * Matrícula, cupos, cambio académico (incluye cambio de campaña conservando horario y Junior→Youngster). ÚNICO lugar transaccional donde nace un alumno.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {};
