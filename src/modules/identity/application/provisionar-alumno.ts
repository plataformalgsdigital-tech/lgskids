import type { PoolClient } from "pg";
import { execute } from "@/platform/db/query";
import { baseUsername, correoSintetico } from "../domain/username";
import { crearCuentaTx } from "./alta-cuenta";

type Queryable = Pick<PoolClient, "query">;

export interface AlumnoProvisionado {
  userId: string;
  username: string;
  correo: string;
  /** Se muestra UNA sola vez para entregarla al apoderado. */
  passwordInicial: string;
}

/**
 * Crea las credenciales de un ALUMNO dentro de la transacción del alta única
 * (la invoca `contracts` al aprobar el contrato). Usuario y clave generados
 * (`crearCuentaTx`).
 *
 * Correo (2026-10-21): el de la FAMILIA —el del apoderado, como viene de LGS—,
 * marcado `email_familiar` porque los hermanos lo comparten y el índice de
 * correo único no debe contarlo. Solo si la familia no tiene correo se usa el
 * SINTÉTICO no enrutable de antes (ADR-0005). El login sigue siendo por usuario.
 */
export async function provisionarUsuarioAlumno(
  tx: Queryable,
  datos: { nombres: string; apellidos: string; correoFamiliar?: string | null },
): Promise<AlumnoProvisionado> {
  const familiar = datos.correoFamiliar?.trim().toLowerCase() || null;
  const correo = (username: string) => familiar ?? correoSintetico(username);
  const cuenta = await crearCuentaTx(tx, {
    base: baseUsername(datos.nombres, datos.apellidos),
    email: correo,
    emailSintetico: familiar === null,
    emailFamiliar: familiar !== null,
  });
  return { ...cuenta, correo: correo(cuenta.username) };
}

/**
 * Reactiva las credenciales de un usuario DENTRO de una transacción: el camino
 * inverso de `inactivarUsuarioTx`. Lo usa el alta única cuando el niño VUELVE
 * (su cuenta quedó INACTIVA al vencer el contrato anterior y aprueba uno
 * nuevo). Las sesiones revocadas no reviven: entra de nuevo con su clave.
 */
export async function reactivarUsuarioTx(tx: Queryable, userId: string): Promise<boolean> {
  const n = await execute(
    `UPDATE identity_user SET estado = 'ACTIVO', updated_at = now()
      WHERE id = $1 AND estado <> 'ACTIVO'`,
    [userId],
    tx,
  );
  return n > 0;
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
