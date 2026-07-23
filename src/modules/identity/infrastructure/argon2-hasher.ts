import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasherPort } from "../application/ports";

/**
 * Hash de contraseñas con argon2id (ADR-0005).
 * Parámetros: memoria 19 MiB, 2 iteraciones, paralelismo 1 — recomendación
 * OWASP para argon2id.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export class Argon2Hasher implements PasswordHasherPort {
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password, ARGON2_OPTIONS);
    } catch {
      // Hash malformado o incompatible: nunca lanzar hacia el login.
      return false;
    }
  }
}
