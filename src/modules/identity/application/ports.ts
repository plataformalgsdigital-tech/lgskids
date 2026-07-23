/**
 * PUERTOS del módulo identity — interfaces que la capa application necesita.
 * La capa infrastructure las implementa (regla 3.4.3).
 */

export type UserEstado = "ACTIVO" | "INACTIVO" | "BLOQUEADO";

export interface UserRecord {
  id: string;
  username: string;
  email: string | null;
  estado: UserEstado;
  debeCambiarPassword: boolean;
  passwordHash: string;
}

export interface UserRepositoryPort {
  findByUsername(username: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  updatePassword(id: string, passwordHash: string, debeCambiar: boolean): Promise<void>;
  touchUltimoLogin(id: string): Promise<void>;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiraEn: Date;
  revocadoEn: Date | null;
}

export interface RefreshTokenRepositoryPort {
  create(record: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiraEn: Date;
  }): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string, motivo: string): Promise<void>;
  /** Revoca TODOS los tokens vivos de la familia (detección de reuso). */
  revokeFamily(familyId: string, motivo: string): Promise<void>;
  /** Revoca todos los tokens vivos del usuario (cambio de contraseña, inactivación). */
  revokeAllForUser(userId: string, motivo: string): Promise<void>;
  /** Borra tokens expirados hace más de `antesDe`. Devuelve filas borradas. */
  deleteExpiredBefore(antesDe: Date): Promise<number>;
}

export interface LoginAttemptRepositoryPort {
  record(username: string, ip: string, exito: boolean): Promise<void>;
  countRecentFailures(username: string, ip: string, desde: Date): Promise<number>;
}

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  userId: string;
  username: string;
}

export interface TokenServicePort {
  signAccessToken(claims: AccessTokenClaims): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}

/** Puerto de auditoría que identity necesita; lo implementa el módulo audit. */
export interface AuditWriterPort {
  registrar(entry: {
    actorUserId?: string | null;
    accion: string;
    entidad: string;
    entidadId?: string | null;
    payload?: Record<string, unknown>;
    ip?: string | null;
  }): Promise<void>;
}
