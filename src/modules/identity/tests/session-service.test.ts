import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooManyRequestsError, UnauthorizedError, ValidationError } from "@/platform/errors";
import type {
  AuditWriterPort,
  LoginAttemptRepositoryPort,
  PasswordHasherPort,
  RefreshTokenRecord,
  RefreshTokenRepositoryPort,
  TokenServicePort,
  UserRecord,
  UserRepositoryPort,
} from "../application/ports";
import { SessionService } from "../application/session-service";

/**
 * Pruebas del núcleo de sesión con dobles en memoria. Cubren las reglas de
 * ADR-0005: rate limiting, rotación por familia y DETECCIÓN DE REUSO.
 */

class FakeUsers implements UserRepositoryPort {
  users = new Map<string, UserRecord>();
  async findByUsername(username: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.username === username) ?? null;
  }
  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }
  async updatePassword(id: string, passwordHash: string, debeCambiar: boolean): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.passwordHash = passwordHash;
      user.debeCambiarPassword = debeCambiar;
    }
  }
  async touchUltimoLogin(): Promise<void> {}
}

class FakeRefreshTokens implements RefreshTokenRepositoryPort {
  tokens: (RefreshTokenRecord & { motivo?: string })[] = [];
  private seq = 0;
  async create(record: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiraEn: Date;
  }): Promise<void> {
    this.seq += 1;
    this.tokens.push({ id: `t${this.seq}`, revocadoEn: null, ...record });
  }
  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.tokens.find((t) => t.tokenHash === tokenHash) ?? null;
  }
  async revoke(id: string, motivo: string): Promise<void> {
    const t = this.tokens.find((x) => x.id === id);
    if (t && t.revocadoEn === null) {
      t.revocadoEn = new Date();
      t.motivo = motivo;
    }
  }
  async revokeFamily(familyId: string, motivo: string): Promise<void> {
    for (const t of this.tokens) {
      if (t.familyId === familyId && t.revocadoEn === null) {
        t.revocadoEn = new Date();
        t.motivo = motivo;
      }
    }
  }
  async revokeAllForUser(userId: string, motivo: string): Promise<void> {
    for (const t of this.tokens) {
      if (t.userId === userId && t.revocadoEn === null) {
        t.revocadoEn = new Date();
        t.motivo = motivo;
      }
    }
  }
  async deleteExpiredBefore(antesDe: Date): Promise<number> {
    const antes = this.tokens.length;
    this.tokens = this.tokens.filter((t) => t.expiraEn >= antesDe);
    return antes - this.tokens.length;
  }
}

class FakeAttempts implements LoginAttemptRepositoryPort {
  attempts: { username: string; ip: string; exito: boolean; at: Date }[] = [];
  async record(username: string, ip: string, exito: boolean): Promise<void> {
    this.attempts.push({ username, ip, exito, at: new Date() });
  }
  async countRecentFailures(username: string, ip: string, desde: Date): Promise<number> {
    return this.attempts.filter(
      (a) => !a.exito && a.at >= desde && (a.username === username || a.ip === ip),
    ).length;
  }
}

const fakeHasher: PasswordHasherPort = {
  hash: async (p) => `hash:${p}`,
  verify: async (p, h) => h === `hash:${p}`,
};

const fakeTokens: TokenServicePort = {
  signAccessToken: async (c) => `jwt:${c.userId}`,
  verifyAccessToken: async () => {
    throw new Error("no usado en estas pruebas");
  },
};

const auditRegistrar = vi.fn(async () => {});
const fakeAudit: AuditWriterPort = { registrar: auditRegistrar };

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u1",
    username: "mgarcia2841",
    email: null,
    estado: "ACTIVO",
    debeCambiarPassword: false,
    passwordHash: "hash:Secreta123!",
    ...overrides,
  };
}

describe("SessionService", () => {
  let users: FakeUsers;
  let refresh: FakeRefreshTokens;
  let attempts: FakeAttempts;
  let service: SessionService;

  beforeEach(() => {
    users = new FakeUsers();
    refresh = new FakeRefreshTokens();
    attempts = new FakeAttempts();
    auditRegistrar.mockClear();
    users.users.set("u1", makeUser());
    service = new SessionService({
      users,
      refreshTokens: refresh,
      attempts,
      hasher: fakeHasher,
      tokens: fakeTokens,
      audit: fakeAudit,
    });
  });

  it("login correcto emite access + refresh y audita", async () => {
    const { tokens, user } = await service.login({
      username: "MGarcia2841",
      password: "Secreta123!",
      ip: "1.1.1.1",
    });
    expect(tokens.accessToken).toBe("jwt:u1");
    expect(tokens.refreshToken).toBeTruthy();
    expect(user.id).toBe("u1");
    expect(refresh.tokens).toHaveLength(1);
    expect(auditRegistrar).toHaveBeenCalledWith(expect.objectContaining({ accion: "auth.login" }));
  });

  it("contraseña errada da 401 y registra el intento", async () => {
    await expect(
      service.login({ username: "mgarcia2841", password: "mala", ip: "1.1.1.1" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(attempts.attempts.at(-1)?.exito).toBe(false);
  });

  it("usuario INACTIVO no puede entrar aunque la contraseña sea correcta", async () => {
    users.users.set("u1", makeUser({ estado: "INACTIVO" }));
    await expect(
      service.login({ username: "mgarcia2841", password: "Secreta123!", ip: "1.1.1.1" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("al 6.º intento fallido responde 429 (rate limiting)", async () => {
    for (let i = 0; i < 5; i += 1) {
      await service
        .login({ username: "mgarcia2841", password: "mala", ip: "1.1.1.1" })
        .catch(() => undefined);
    }
    await expect(
      service.login({ username: "mgarcia2841", password: "Secreta123!", ip: "1.1.1.1" }),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("refresh rota el token: el anterior queda revocado y el nuevo sirve", async () => {
    const { tokens } = await service.login({
      username: "mgarcia2841",
      password: "Secreta123!",
      ip: "1.1.1.1",
    });
    const rotated = await service.refresh(tokens.refreshToken);
    expect(rotated.tokens.refreshToken).not.toBe(tokens.refreshToken);
    expect(refresh.tokens[0]?.revocadoEn).not.toBeNull();
    expect(refresh.tokens[1]?.revocadoEn).toBeNull();
    // Misma familia.
    expect(refresh.tokens[1]?.familyId).toBe(refresh.tokens[0]?.familyId);
  });

  it("REUSO de un refresh ya rotado revoca la familia completa", async () => {
    const { tokens } = await service.login({
      username: "mgarcia2841",
      password: "Secreta123!",
      ip: "1.1.1.1",
    });
    await service.refresh(tokens.refreshToken); // rotación legítima
    // Un atacante presenta el token viejo:
    await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    // TODA la familia quedó revocada, incluido el token nuevo.
    expect(refresh.tokens.every((t) => t.revocadoEn !== null)).toBe(true);
    expect(auditRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "auth.refresh_reuso_detectado" }),
    );
  });

  it("refresh expirado da 401", async () => {
    const { tokens } = await service.login({
      username: "mgarcia2841",
      password: "Secreta123!",
      ip: "1.1.1.1",
    });
    const record = refresh.tokens[0];
    if (record) record.expiraEn = new Date(Date.now() - 1000);
    await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("cambio de contraseña revoca todas las sesiones del usuario", async () => {
    const { tokens } = await service.login({
      username: "mgarcia2841",
      password: "Secreta123!",
      ip: "1.1.1.1",
    });
    await service.changePassword({
      userId: "u1",
      passwordActual: "Secreta123!",
      passwordNueva: "NuevaClave99",
      ip: "1.1.1.1",
    });
    expect(refresh.tokens.every((t) => t.revocadoEn !== null)).toBe(true);
    await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    // La nueva contraseña queda activa.
    const user = users.users.get("u1");
    expect(user?.passwordHash).toBe("hash:NuevaClave99");
  });

  it("cambio de contraseña exige la política (débil → ValidationError)", async () => {
    await expect(
      service.changePassword({
        userId: "u1",
        passwordActual: "Secreta123!",
        passwordNueva: "corta1",
        ip: "1.1.1.1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("logout revoca la familia", async () => {
    const { tokens } = await service.login({
      username: "mgarcia2841",
      password: "Secreta123!",
      ip: "1.1.1.1",
    });
    await service.logout(tokens.refreshToken);
    expect(refresh.tokens.every((t) => t.revocadoEn !== null)).toBe(true);
  });

  it("la purga borra solo tokens vencidos hace más de 7 días", async () => {
    await service.login({ username: "mgarcia2841", password: "Secreta123!", ip: "1.1.1.1" });
    const viejo = refresh.tokens[0];
    if (viejo) viejo.expiraEn = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const borrados = await service.purgeExpiredRefreshTokens();
    expect(borrados).toBe(1);
    expect(refresh.tokens).toHaveLength(0);
  });
});
