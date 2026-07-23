import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { UnauthorizedError } from "@/platform/errors";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";
import { JwtTokenService } from "../infrastructure/jwt-token-service";
import { PgLoginAttemptRepository } from "../infrastructure/login-attempt-repository";
import { PgRefreshTokenRepository } from "../infrastructure/refresh-token-repository";
import { PgUserRepository } from "../infrastructure/user-repository";
import { SessionService } from "../application/session-service";

/**
 * INTEGRACIÓN contra PostgreSQL real (migración aplicada). Se activa con
 * INTEGRATION_TESTS=1 (CI la corre con Postgres como service container).
 */
const RUN =
  env().INTEGRATION_TESTS === "1" &&
  env().DATABASE_URL !== undefined &&
  env().AUTH_JWT_SECRET !== undefined;

describe.runIf(RUN)("SessionService (integración con Postgres)", () => {
  const username = `it_${newId().slice(0, 8)}`;
  const password = "ClaveDePrueba99";
  let userId: string;
  let service: SessionService;

  beforeAll(async () => {
    userId = newId();
    const hash = await new Argon2Hasher().hash(password);
    await execute(
      `INSERT INTO identity_user (id, username, password_hash, estado, updated_at)
       VALUES ($1, $2, $3, 'ACTIVO', now())`,
      [userId, username, hash],
    );
    service = new SessionService({
      users: new PgUserRepository(),
      refreshTokens: new PgRefreshTokenRepository(),
      attempts: new PgLoginAttemptRepository(),
      hasher: new Argon2Hasher(),
      tokens: new JwtTokenService(),
      audit: { registrar: async () => {} },
    });
  });

  afterAll(async () => {
    if (userId !== undefined) {
      // Cascada: borra también sus refresh tokens (FK ON DELETE CASCADE).
      await execute(`DELETE FROM identity_user WHERE id = $1`, [userId]);
      await execute(`DELETE FROM identity_login_attempt WHERE username = $1`, [username]);
    }
    await closePool();
  });

  it("flujo completo: login → refresh → reuso detectado revoca la familia", async () => {
    const login = await service.login({ username, password, ip: "10.0.0.1" });
    expect(login.tokens.accessToken).toBeTruthy();

    const rotado = await service.refresh(login.tokens.refreshToken);
    expect(rotado.tokens.refreshToken).not.toBe(login.tokens.refreshToken);

    // Reuso del token viejo → 401 y la familia completa muere.
    await expect(service.refresh(login.tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(service.refresh(rotado.tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("el JWT emitido se verifica y trae los claims correctos", async () => {
    const login = await service.login({ username, password, ip: "10.0.0.1" });
    const claims = await new JwtTokenService().verifyAccessToken(login.tokens.accessToken);
    expect(claims.userId).toBe(userId);
    expect(claims.username).toBe(username);
  });
});
