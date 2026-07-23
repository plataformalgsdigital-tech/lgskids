/** PUERTOS del módulo audit. */

export interface AuditEntry {
  actorUserId?: string | null;
  accion: string; // ej. auth.login, access.rol_asignado
  entidad: string; // ej. identity_user
  entidadId?: string | null;
  payload?: Record<string, unknown>;
  ip?: string | null;
}

export interface AuditRecord extends AuditEntry {
  id: string;
  correlationId: string | null;
  createdAt: Date;
}

export interface AuditRepositoryPort {
  insert(entry: AuditEntry & { correlationId: string | null }): Promise<void>;
  list(params: {
    entidad?: string;
    accion?: string;
    actorUserId?: string;
    limit: number;
    offset: number;
  }): Promise<AuditRecord[]>;
}
