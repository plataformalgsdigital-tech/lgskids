import type { PoolClient } from "pg";
import { queryOne } from "@/platform/db/query";
import { ConflictError } from "@/platform/errors";
import { newId, randomDigits } from "@/platform/ids";
import { generarPasswordInicial } from "../domain/credenciales";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";
import { copiaCifrada } from "../infrastructure/boveda-claves";

type Queryable = Pick<PoolClient, "query">;

export interface CuentaCreada {
  userId: string;
  username: string;
  /** Se muestra UNA vez al crear; después solo la ve el superadmin. */
  passwordInicial: string;
}

/**
 * Crea la cuenta DENTRO de la transacción recibida, con usuario y clave
 * GENERADOS: nadie los elige, así no se repiten ni se adivinan.
 *
 * Usuario = `base` + 4 dígitos al azar. La unicidad la garantiza la base (índice
 * único de `username`) y el alta la aprovecha con `ON CONFLICT DO NOTHING`: dos
 * altas simultáneas que sortean el mismo nombre no chocan, la segunda prueba
 * otro. (Antes se consultaba primero y se insertaba después, y entre las dos
 * cosas otra alta podía llevarse el nombre.)
 *
 * Queda ACTIVA y con "debe cambiar clave" encendido: la clave generada se
 * cambia en el primer ingreso.
 */
export async function crearCuentaTx(
  tx: Queryable,
  opciones: {
    base: string;
    /** Correo a partir del usuario ya elegido (los alumnos llevan uno sintético). */
    email: (username: string) => string | null;
    emailSintetico: boolean;
    /**
     * Id ya reservado, cuando algo que cuelga de la cuenta se guarda ANTES de
     * la transacción (la foto del guía va a almacenamiento, no a la base).
     */
    id?: string;
  },
): Promise<CuentaCreada> {
  const passwordInicial = generarPasswordInicial();
  const passwordHash = await new Argon2Hasher().hash(passwordInicial);
  const userId = opciones.id ?? newId();
  const cifrada = copiaCifrada(passwordInicial, userId);

  for (let intento = 0; intento < 25; intento += 1) {
    const username = `${opciones.base}${randomDigits(4)}`;
    const fila = await queryOne<{ id: string }>(
      `INSERT INTO identity_user
         (id, username, email, email_sintetico, password_hash, password_cifrada,
          estado, debe_cambiar_password, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', true, now())
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [userId, username, opciones.email(username), opciones.emailSintetico, passwordHash, cifrada],
      tx,
    );
    if (fila !== null) return { userId, username, passwordInicial };
  }
  throw new ConflictError("No se pudo generar un nombre de usuario libre. Reintenta.");
}
