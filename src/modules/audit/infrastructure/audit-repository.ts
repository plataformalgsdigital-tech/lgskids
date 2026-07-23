import { execute, queryRows } from "@/platform/db/query";
import type { AuditEntry, AuditRecord, AuditRepositoryPort } from "../application/ports";

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  payload: Record<string, unknown> | null;
  correlation_id: string | null;
  ip: string | null;
  created_at: Date;
}

export class PgAuditRepository implements AuditRepositoryPort {
  async insert(entry: AuditEntry & { correlationId: string | null }): Promise<void> {
    await execute(
      `INSERT INTO audit_log (actor_user_id, accion, entidad, entidad_id, payload, correlation_id, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.actorUserId ?? null,
        entry.accion,
        entry.entidad,
        entry.entidadId ?? null,
        entry.payload !== undefined ? JSON.stringify(entry.payload) : null,
        entry.correlationId,
        entry.ip ?? null,
      ],
    );
  }

  async list(params: {
    entidad?: string;
    accion?: string;
    actorUserId?: string;
    limit: number;
    offset: number;
  }): Promise<AuditRecord[]> {
    // Filtros dinámicos con parámetros posicionales; SIEMPRE paginado.
    const where: string[] = [];
    const values: unknown[] = [];
    if (params.entidad !== undefined) {
      values.push(params.entidad);
      where.push(`entidad = $${values.length}`);
    }
    if (params.accion !== undefined) {
      values.push(params.accion);
      where.push(`accion = $${values.length}`);
    }
    if (params.actorUserId !== undefined) {
      values.push(params.actorUserId);
      where.push(`actor_user_id = $${values.length}`);
    }
    values.push(params.limit);
    const limitIdx = values.length;
    values.push(params.offset);
    const offsetIdx = values.length;

    const rows = await queryRows<AuditRow>(
      `SELECT id::text, actor_user_id, accion, entidad, entidad_id, payload, correlation_id, ip, created_at
         FROM audit_log
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY created_at DESC, id DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values,
    );
    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      accion: row.accion,
      entidad: row.entidad,
      entidadId: row.entidad_id,
      ...(row.payload !== null && { payload: row.payload }),
      correlationId: row.correlation_id,
      ip: row.ip,
      createdAt: row.created_at,
    }));
  }
}
