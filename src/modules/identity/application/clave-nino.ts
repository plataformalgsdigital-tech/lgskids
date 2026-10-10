import type { PoolClient } from "pg";
import { execute } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import { problemaClaveNino } from "../domain/password-policy";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";
import { copiaCifrada } from "../infrastructure/boveda-claves";

type Queryable = Pick<PoolClient, "query">;

/**
 * Fija la clave que el NIÑO eligió al crear su perfil, DENTRO de la
 * transacción de quien llama (la creación de perfil: clave, perfil y Welcome
 * van juntos o no va ninguno).
 *
 * Igual que un cambio de clave: hash argon2id, copia en la bóveda (si está
 * encendida), "cambiar clave al entrar" APAGADO —la acaba de elegir él— y las
 * sesiones abiertas revocadas.
 */
export async function fijarClaveNinoTx(
  tx: Queryable,
  userId: string,
  clave: string,
): Promise<void> {
  const problema = problemaClaveNino(clave);
  if (problema !== null) throw new ValidationError(problema);
  const hash = await new Argon2Hasher().hash(clave);
  await execute(
    `UPDATE identity_user
        SET password_hash = $2, password_cifrada = $3, debe_cambiar_password = false,
            updated_at = now()
      WHERE id = $1`,
    [userId, hash, copiaCifrada(clave, userId)],
    tx,
  );
  await execute(
    `UPDATE identity_refresh_token SET revocado_en = now(), motivo_revoque = 'clave elegida en el perfil'
      WHERE user_id = $1 AND revocado_en IS NULL`,
    [userId],
    tx,
  );
}
