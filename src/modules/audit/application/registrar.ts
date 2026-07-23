import { currentCorrelationId, logger } from "@/platform/logging/logger";
import type { AuditEntry, AuditRecord, AuditRepositoryPort } from "./ports";
import { PgAuditRepository } from "../infrastructure/audit-repository";

let repository: AuditRepositoryPort = new PgAuditRepository();

/** Solo para pruebas. */
export function setAuditRepositoryForTests(repo: AuditRepositoryPort): void {
  repository = repo;
}

/**
 * Registra una operación crítica. El correlation ID se toma del contexto de
 * la request automáticamente.
 *
 * La auditoría NUNCA rompe la operación principal: si el insert falla, se
 * loguea el error y la operación de negocio continúa.
 */
export async function registrarAuditoria(entry: AuditEntry): Promise<void> {
  try {
    await repository.insert({ ...entry, correlationId: currentCorrelationId() ?? null });
  } catch (error) {
    logger.error("No se pudo registrar auditoría", {
      accion: entry.accion,
      entidad: entry.entidad,
      error: String(error),
    });
  }
}

/** Consulta paginada de auditoría (la autorización la hace la ruta). */
export async function listarAuditoria(params: {
  entidad?: string;
  accion?: string;
  actorUserId?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditRecord[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  return repository.list({
    ...(params.entidad !== undefined && { entidad: params.entidad }),
    ...(params.accion !== undefined && { accion: params.accion }),
    ...(params.actorUserId !== undefined && { actorUserId: params.actorUserId }),
    limit,
    offset,
  });
}
