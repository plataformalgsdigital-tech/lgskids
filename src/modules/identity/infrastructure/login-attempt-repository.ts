import { execute, queryOne } from "@/platform/db/query";
import type { LoginAttemptRepositoryPort } from "../application/ports";

export class PgLoginAttemptRepository implements LoginAttemptRepositoryPort {
  async record(username: string, ip: string, exito: boolean): Promise<void> {
    await execute(`INSERT INTO identity_login_attempt (username, ip, exito) VALUES ($1, $2, $3)`, [
      username,
      ip,
      exito,
    ]);
  }

  async countRecentFailures(username: string, ip: string, desde: Date): Promise<number> {
    // Cuenta por username O por IP: frena tanto el ataque a una cuenta como
    // el barrido desde una misma IP. Usa los índices (username, created_at)
    // e (ip, created_at) — sin funciones sobre columnas indexadas.
    const row = await queryOne<{ total: string }>(
      `SELECT count(*)::text AS total
         FROM identity_login_attempt
        WHERE exito = false
          AND created_at >= $3
          AND (username = $1 OR ip = $2)`,
      [username, ip, desde],
    );
    return row === null ? 0 : Number(row.total);
  }
}
