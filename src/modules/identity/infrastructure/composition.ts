import { registrarAuditoria } from "@/modules/audit";
import { SessionService } from "../application/session-service";
import type { AuditWriterPort } from "../application/ports";
import { Argon2Hasher } from "./argon2-hasher";
import { copiaCifrada } from "./boveda-claves";
import { JwtTokenService } from "./jwt-token-service";
import { PgLoginAttemptRepository } from "./login-attempt-repository";
import { PgRefreshTokenRepository } from "./refresh-token-repository";
import { PgUserRepository } from "./user-repository";

/**
 * Composición del módulo: instancia única de SessionService con los
 * adaptadores reales. El puerto de auditoría lo implementa el módulo audit
 * (consumido por su index, regla 3.4.1).
 */

const auditWriter: AuditWriterPort = {
  registrar: (entry) => registrarAuditoria(entry),
};

let service: SessionService | null = null;

export function sessionService(): SessionService {
  if (service === null) {
    service = new SessionService({
      users: new PgUserRepository(),
      refreshTokens: new PgRefreshTokenRepository(),
      attempts: new PgLoginAttemptRepository(),
      hasher: new Argon2Hasher(),
      tokens: new JwtTokenService(),
      audit: auditWriter,
      boveda: { copia: copiaCifrada },
    });
  }
  return service;
}

export const tokenService = new JwtTokenService();
export const userRepository = new PgUserRepository();
