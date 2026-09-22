import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "@/platform/config/env";
import { TooManyRequestsError, UnauthorizedError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";
import { validarPassword } from "../domain/password-policy";
import type {
  AuditWriterPort,
  BovedaClavesPort,
  LoginAttemptRepositoryPort,
  PasswordHasherPort,
  RefreshTokenRepositoryPort,
  TokenServicePort,
  UserRecord,
  UserRepositoryPort,
} from "./ports";

/**
 * Casos de uso de sesión: login, refresh rotativo, logout, cambio de
 * contraseña. Reglas (ADR-0005):
 *
 * - Login por USERNAME. Rate limiting persistido (5 fallos / 15 min).
 * - Refresh rotativo por familia: reusar un token ya rotado se interpreta
 *   como robo y revoca la familia completa.
 * - El refresh token solo se guarda hasheado (sha256).
 */

const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MINUTES = 15;

export interface SessionTokens {
  accessToken: string;
  accessExpiresInSeconds: number;
  refreshToken: string;
  refreshExpiresInDays: number;
}

export interface SessionUser {
  id: string;
  username: string;
  debeCambiarPassword: boolean;
}

export interface SessionDeps {
  users: UserRepositoryPort;
  refreshTokens: RefreshTokenRepositoryPort;
  attempts: LoginAttemptRepositoryPort;
  hasher: PasswordHasherPort;
  tokens: TokenServicePort;
  audit: AuditWriterPort;
  /** Bóveda de claves. Sin ella no se guarda copia de la clave nueva. */
  boveda?: BovedaClavesPort;
  /** Inyectable para pruebas. */
  now?: () => Date;
}

function hashRefreshToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

function newRefreshTokenPlain(): string {
  return randomBytes(48).toString("base64url");
}

export class SessionService {
  private readonly now: () => Date;

  constructor(private readonly deps: SessionDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async issueTokens(user: UserRecord, familyId: string): Promise<SessionTokens> {
    const refreshPlain = newRefreshTokenPlain();
    const refreshDays = env().AUTH_REFRESH_TTL_DAYS;
    const expiraEn = new Date(this.now().getTime() + refreshDays * 24 * 60 * 60 * 1000);
    await this.deps.refreshTokens.create({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshPlain),
      familyId,
      expiraEn,
    });
    const accessToken = await this.deps.tokens.signAccessToken({
      userId: user.id,
      username: user.username,
    });
    return {
      accessToken,
      accessExpiresInSeconds: env().AUTH_ACCESS_TTL_SECONDS,
      refreshToken: refreshPlain,
      refreshExpiresInDays: refreshDays,
    };
  }

  async login(input: {
    username: string;
    password: string;
    ip: string;
  }): Promise<{ tokens: SessionTokens; user: SessionUser }> {
    const username = input.username.trim().toLowerCase();

    // Rate limiting contra tabla (nada en memoria).
    const desde = new Date(this.now().getTime() - LOGIN_WINDOW_MINUTES * 60 * 1000);
    const fallos = await this.deps.attempts.countRecentFailures(username, input.ip, desde);
    if (fallos >= MAX_LOGIN_FAILURES) {
      throw new TooManyRequestsError(
        `Demasiados intentos fallidos. Espera ${LOGIN_WINDOW_MINUTES} minutos.`,
      );
    }

    const user = await this.deps.users.findByUsername(username);
    // Verificación en tiempo ~constante: si no existe el usuario igual se
    // computa un verify contra un hash dummy para no filtrar existencia.
    const passwordOk =
      user !== null
        ? await this.deps.hasher.verify(input.password, user.passwordHash)
        : (await this.deps.hasher.hash("dummy-timing-equalizer"), false);

    if (user === null || !passwordOk || user.estado !== "ACTIVO") {
      await this.deps.attempts.record(username, input.ip, false);
      throw new UnauthorizedError("Usuario o contraseña incorrectos.");
    }

    await this.deps.attempts.record(username, input.ip, true);
    await this.deps.users.touchUltimoLogin(user.id);

    const tokens = await this.issueTokens(user, randomUUID());
    await this.deps.audit.registrar({
      actorUserId: user.id,
      accion: "auth.login",
      entidad: "identity_user",
      entidadId: user.id,
      ip: input.ip,
    });
    return {
      tokens,
      user: {
        id: user.id,
        username: user.username,
        debeCambiarPassword: user.debeCambiarPassword,
      },
    };
  }

  async refresh(refreshTokenPlain: string): Promise<{ tokens: SessionTokens; user: SessionUser }> {
    const record = await this.deps.refreshTokens.findByHash(hashRefreshToken(refreshTokenPlain));
    if (record === null) {
      throw new UnauthorizedError("Sesión inválida. Inicia sesión nuevamente.");
    }

    // DETECCIÓN DE REUSO: un token ya rotado/revocado que vuelve a
    // presentarse = posible robo → se revoca la familia completa.
    if (record.revocadoEn !== null) {
      await this.deps.refreshTokens.revokeFamily(record.familyId, "reuso detectado");
      await this.deps.audit.registrar({
        actorUserId: record.userId,
        accion: "auth.refresh_reuso_detectado",
        entidad: "identity_refresh_token",
        entidadId: record.id,
      });
      logger.warn("Reuso de refresh token detectado; familia revocada", {
        userId: record.userId,
        familyId: record.familyId,
      });
      throw new UnauthorizedError("Sesión inválida. Inicia sesión nuevamente.");
    }

    if (record.expiraEn.getTime() <= this.now().getTime()) {
      throw new UnauthorizedError("La sesión expiró. Inicia sesión nuevamente.");
    }

    const user = await this.deps.users.findById(record.userId);
    if (user === null || user.estado !== "ACTIVO") {
      await this.deps.refreshTokens.revokeFamily(record.familyId, "usuario no activo");
      throw new UnauthorizedError("Sesión inválida. Inicia sesión nuevamente.");
    }

    // Rotación: el token usado queda revocado y se emite uno nuevo en la
    // misma familia.
    await this.deps.refreshTokens.revoke(record.id, "rotado");
    const tokens = await this.issueTokens(user, record.familyId);
    return {
      tokens,
      user: {
        id: user.id,
        username: user.username,
        debeCambiarPassword: user.debeCambiarPassword,
      },
    };
  }

  async logout(refreshTokenPlain: string | null): Promise<void> {
    if (refreshTokenPlain === null) {
      return; // sin cookie no hay nada que revocar
    }
    const record = await this.deps.refreshTokens.findByHash(hashRefreshToken(refreshTokenPlain));
    if (record !== null) {
      await this.deps.refreshTokens.revokeFamily(record.familyId, "logout");
      await this.deps.audit.registrar({
        actorUserId: record.userId,
        accion: "auth.logout",
        entidad: "identity_user",
        entidadId: record.userId,
      });
    }
  }

  async changePassword(input: {
    userId: string;
    passwordActual: string;
    passwordNueva: string;
    ip: string;
  }): Promise<void> {
    const user = await this.deps.users.findById(input.userId);
    if (user === null || user.estado !== "ACTIVO") {
      throw new UnauthorizedError("Sesión inválida.");
    }
    const actualOk = await this.deps.hasher.verify(input.passwordActual, user.passwordHash);
    if (!actualOk) {
      throw new ValidationError("La contraseña actual no es correcta.");
    }
    if (input.passwordNueva === input.passwordActual) {
      throw new ValidationError("La contraseña nueva debe ser distinta de la actual.");
    }
    validarPassword(input.passwordNueva);

    const nuevoHash = await this.deps.hasher.hash(input.passwordNueva);
    // También la que elige el usuario queda consultable por el superadmin
    // (decisión del negocio; ver `boveda-claves.ts`).
    const cifrada = this.deps.boveda?.copia(input.passwordNueva, user.id) ?? null;
    await this.deps.users.updatePassword(user.id, nuevoHash, false, cifrada);
    // Toda sesión previa muere: si alguien tenía el refresh robado, se corta.
    await this.deps.refreshTokens.revokeAllForUser(user.id, "cambio de contraseña");
    await this.deps.audit.registrar({
      actorUserId: user.id,
      accion: "auth.password_cambiada",
      entidad: "identity_user",
      entidadId: user.id,
      ip: input.ip,
    });
  }

  /** Tarea del worker: borra tokens expirados hace más de 7 días. */
  async purgeExpiredRefreshTokens(): Promise<number> {
    const antesDe = new Date(this.now().getTime() - 7 * 24 * 60 * 60 * 1000);
    return this.deps.refreshTokens.deleteExpiredBefore(antesDe);
  }
}
