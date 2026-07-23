/**
 * Módulo `identity` — API PÚBLICA.
 *
 * Autenticación, sesiones, credenciales. Login por username autogenerado (no por correo); correo sintético interno para hermanos que comparten email.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export {};
