import { queryOne, execute } from "@/platform/db/query";
import type { UserRecord, UserRepositoryPort, UserEstado } from "../application/ports";

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  estado: UserEstado;
  debe_cambiar_password: boolean;
  password_hash: string;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    estado: row.estado,
    debeCambiarPassword: row.debe_cambiar_password,
    passwordHash: row.password_hash,
  };
}

const SELECT_USER =
  "SELECT id, username, email, estado, debe_cambiar_password, password_hash FROM identity_user";

export class PgUserRepository implements UserRepositoryPort {
  async findByUsername(username: string): Promise<UserRecord | null> {
    const row = await queryOne<UserRow>(`${SELECT_USER} WHERE username = $1`, [username]);
    return row === null ? null : toRecord(row);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await queryOne<UserRow>(`${SELECT_USER} WHERE id = $1`, [id]);
    return row === null ? null : toRecord(row);
  }

  async updatePassword(
    id: string,
    passwordHash: string,
    debeCambiar: boolean,
    cifrada: string | null = null,
  ): Promise<void> {
    // La copia se REEMPLAZA siempre, también por null: una copia de la clave
    // anterior mostraría al superadmin una clave que ya no sirve.
    await execute(
      `UPDATE identity_user
         SET password_hash = $2, debe_cambiar_password = $3, password_cifrada = $4,
             updated_at = now()
       WHERE id = $1`,
      [id, passwordHash, debeCambiar, cifrada],
    );
  }

  async touchUltimoLogin(id: string): Promise<void> {
    await execute(`UPDATE identity_user SET ultimo_login_en = now() WHERE id = $1`, [id]);
  }
}
