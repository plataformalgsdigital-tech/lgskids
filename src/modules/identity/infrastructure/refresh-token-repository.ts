import { newId } from "@/platform/ids";
import { execute, queryOne } from "@/platform/db/query";
import type { RefreshTokenRecord, RefreshTokenRepositoryPort } from "../application/ports";

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expira_en: Date;
  revocado_en: Date | null;
}

export class PgRefreshTokenRepository implements RefreshTokenRepositoryPort {
  async create(record: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiraEn: Date;
  }): Promise<void> {
    await execute(
      `INSERT INTO identity_refresh_token (id, user_id, token_hash, family_id, expira_en)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId(), record.userId, record.tokenHash, record.familyId, record.expiraEn],
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await queryOne<TokenRow>(
      `SELECT id, user_id, token_hash, family_id, expira_en, revocado_en
         FROM identity_refresh_token WHERE token_hash = $1`,
      [tokenHash],
    );
    if (row === null) return null;
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      familyId: row.family_id,
      expiraEn: row.expira_en,
      revocadoEn: row.revocado_en,
    };
  }

  async revoke(id: string, motivo: string): Promise<void> {
    await execute(
      `UPDATE identity_refresh_token
         SET revocado_en = now(), motivo_revoque = $2
       WHERE id = $1 AND revocado_en IS NULL`,
      [id, motivo],
    );
  }

  async revokeFamily(familyId: string, motivo: string): Promise<void> {
    await execute(
      `UPDATE identity_refresh_token
         SET revocado_en = now(), motivo_revoque = $2
       WHERE family_id = $1 AND revocado_en IS NULL`,
      [familyId, motivo],
    );
  }

  async revokeAllForUser(userId: string, motivo: string): Promise<void> {
    await execute(
      `UPDATE identity_refresh_token
         SET revocado_en = now(), motivo_revoque = $2
       WHERE user_id = $1 AND revocado_en IS NULL`,
      [userId, motivo],
    );
  }

  async deleteExpiredBefore(antesDe: Date): Promise<number> {
    return execute(`DELETE FROM identity_refresh_token WHERE expira_en < $1`, [antesDe]);
  }
}
