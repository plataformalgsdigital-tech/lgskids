import { execute, queryOne } from "@/platform/db/query";
import { llaveBovedaClaves } from "@/platform/config/env";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";
import { copiaCifrada } from "../infrastructure/boveda-claves";

/**
 * RECUPERAR LA COPIA de la bóveda de una cuenta que no la tiene (2026-11-12),
 * SIN cambiar su clave.
 *
 * Las cuentas creadas antes de la bóveda, o por un script que corrió sin la llave
 * (los niños de AGOSTO2026), solo tienen el hash: "Ver clave" y "Enviar acceso"
 * dicen "Sin copia". Si alguien conserva la clave en claro —LGS guarda la clave
 * INICIAL de cada niño que matriculó en KIDS—, esa clave se comprueba contra el
 * hash y, SOLO si coincide, se guarda su copia cifrada. Una clave que no coincide
 * (el niño ya la cambió) no se guarda nunca: la bóveda no puede mostrar una clave
 * que no abre la cuenta.
 *
 * No toca el hash, ni "cambiar clave al entrar", ni las sesiones: la cuenta sigue
 * exactamente igual; solo gana su copia.
 */

export type ResultadoCopia =
  /** Coincide y se guardó la copia. */
  | "RECUPERADA"
  /** Coincide; no se guardó (prueba sin aplicar). */
  | "COINCIDE"
  /** La clave ya no es esa: el niño la cambió. No se guarda nada. */
  | "NO_COINCIDE"
  /** La cuenta ya tenía copia: no se toca. */
  | "YA_TENIA"
  | "SIN_CUENTA";

export function bovedaEncendida(): boolean {
  return llaveBovedaClaves() !== null;
}

export async function guardarCopiaSiCoincide(
  userId: string,
  clave: string,
  aplicar: boolean,
): Promise<ResultadoCopia> {
  const fila = await queryOne<{ hash: string; tieneCopia: boolean }>(
    `SELECT password_hash AS hash, password_cifrada IS NOT NULL AS "tieneCopia"
       FROM identity_user WHERE id = $1`,
    [userId],
  );
  if (fila === null) return "SIN_CUENTA";
  if (fila.tieneCopia) return "YA_TENIA";
  if (!(await new Argon2Hasher().verify(clave, fila.hash))) return "NO_COINCIDE";
  if (!aplicar) return "COINCIDE";
  const copia = copiaCifrada(clave, userId);
  if (copia === null) throw new Error("La bóveda de claves está apagada (PASSWORD_VAULT_KEY).");
  // El hash en el WHERE: si la clave cambió entre la comprobación y aquí, no se
  // guarda una copia de la clave vieja.
  const n = await execute(
    `UPDATE identity_user SET password_cifrada = $2, updated_at = now()
      WHERE id = $1 AND password_cifrada IS NULL AND password_hash = $3`,
    [userId, copia, fila.hash],
  );
  return n > 0 ? "RECUPERADA" : "YA_TENIA";
}
