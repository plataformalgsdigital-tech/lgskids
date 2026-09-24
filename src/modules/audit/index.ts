/**
 * Módulo `audit` — API PÚBLICA.
 *
 * Auditoría de operaciones críticas: quién, qué, cuándo, motivo, correlation ID. Tabla separada de las operativas.
 *
 * La auditoría NUNCA rompe la operación principal.
 *
 * REGLA DE ARQUITECTURA: este archivo es lo ÚNICO importable desde fuera del
 * módulo. Alcanzar rutas internas (domain/, application/, infrastructure/,
 * api/, ui/) desde otro módulo es una violación verificada en CI.
 */
export { registrarAuditoria, listarAuditoria, contarPorIp } from "./application/registrar";
export type { AuditEntry, AuditRecord } from "./application/ports";
