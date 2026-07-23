import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError } from "@/platform/errors";
import { newId, randomDigits } from "@/platform/ids";
import { baseUsername, correoSintetico } from "../domain/username";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";

type Queryable = Pick<PoolClient, "query">;

export interface AlumnoProvisionado {
  userId: string;
  username: string;
  correo: string;
  /** Se muestra UNA sola vez para entregarla al apoderado. */
  passwordInicial: string;
}

/**
 * Contraseña inicial legible para dictar por WhatsApp: sílabas + números
 * (ej. "poketimu42"). Cumple la política (10+, letras y números) y queda
 * marcada para cambio en el primer ingreso.
 */
function generarPasswordInicial(): string {
  const consonantes = "bdfgklmnprstvz";
  const vocales = "aeiou";
  let palabra = "";
  for (let i = 0; i < 4; i += 1) {
    palabra += consonantes[randomInt(consonantes.length)];
    palabra += vocales[randomInt(vocales.length)];
  }
  return `${palabra}${randomDigits(2)}`;
}

/**
 * Crea las credenciales de un ALUMNO dentro de la transacción del alta única
 * (la invoca `contracts` al aprobar el contrato). Username autogenerado con
 * sufijo numérico hasta encontrar uno libre; correo SINTÉTICO no enrutable
 * (hermanos que comparten el correo del papá no colisionan — ADR-0005).
 */
export async function provisionarUsuarioAlumno(
  tx: Queryable,
  datos: { nombres: string; apellidos: string },
): Promise<AlumnoProvisionado> {
  const base = baseUsername(datos.nombres, datos.apellidos);

  let username: string | null = null;
  for (let intento = 0; intento < 25; intento += 1) {
    const candidato = `${base}${randomDigits(4)}`;
    const ocupado = await queryOne<{ id: string }>(
      `SELECT id FROM identity_user WHERE username = $1`,
      [candidato],
      tx,
    );
    if (ocupado === null) {
      username = candidato;
      break;
    }
  }
  if (username === null) {
    throw new ConflictError("No se pudo generar un nombre de usuario libre. Reintenta.");
  }

  const passwordInicial = generarPasswordInicial();
  const passwordHash = await new Argon2Hasher().hash(passwordInicial);
  const userId = newId();
  const correo = correoSintetico(username);

  await execute(
    `INSERT INTO identity_user
       (id, username, email, email_sintetico, password_hash, estado,
        debe_cambiar_password, updated_at)
     VALUES ($1, $2, $3, true, $4, 'ACTIVO', true, now())`,
    [userId, username, correo, passwordHash],
    tx,
  );

  return { userId, username, correo, passwordInicial };
}

/**
 * Inactiva las credenciales de un usuario DENTRO de una transacción
 * (cascada de inactivación, sección 2.4): estado INACTIVO + revocación de
 * todos sus refresh tokens. El autenticador rechaza usuarios no ACTIVOS en
 * cada request, así que el efecto es inmediato.
 */
export async function inactivarUsuarioTx(tx: Queryable, userId: string): Promise<void> {
  await execute(
    `UPDATE identity_user SET estado = 'INACTIVO', updated_at = now() WHERE id = $1`,
    [userId],
    tx,
  );
  await execute(
    `UPDATE identity_refresh_token
        SET revocado_en = now(), motivo_revoque = 'cascada de inactivación'
      WHERE user_id = $1 AND revocado_en IS NULL`,
    [userId],
    tx,
  );
}
