import type { PoolClient } from "pg";
import { asignarRolTx } from "@/modules/access";
import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import { baseUsername } from "../domain/username";
import { crearCuentaTx, type CuentaCreada } from "./alta-cuenta";

type Queryable = Pick<PoolClient, "query">;

/**
 * Un correo real no se repite entre cuentas (índice
 * `identity_user_email_real_unico`). Se comprueba antes para contestar con el
 * usuario que ya lo tiene, en vez de con un error de la base.
 */
export async function exigirCorreoLibre(
  tx: Queryable | undefined,
  email: string | null,
  /** Al EDITAR, la propia cuenta no cuenta como dueña. */
  excluirUserId?: string,
): Promise<void> {
  if (email === null) return;
  const dueno = await queryOne<{ username: string }>(
    `SELECT username FROM identity_user
      WHERE LOWER(email) = LOWER($1) AND NOT email_sintetico AND id <> $2`,
    [email, excluirUserId ?? "00000000-0000-0000-0000-000000000000"],
    tx,
  );
  if (dueno !== null) {
    throw new ConflictError(
      `Ya hay una cuenta con ese correo (${dueno.username}). No se puede duplicar.`,
    );
  }
}

export interface DatosCuentaStaff {
  nombres: string;
  apellidos: string;
  email?: string | null;
  /**
   * Ficha del ADMINISTRATIVO (`identity_perfil`). El guía no la lleva: su ficha
   * es `scheduling_guia`, y guardar el nombre en las dos sería pedir que se
   * desincronicen.
   */
  perfil?: { telefono?: string | null; docNumero?: string | null } | null;
  roleCode?: string | null;
  countryCode?: string | null;
  /** Id ya reservado (ver `crearCuentaTx`). */
  id?: string;
}

/**
 * Crea la cuenta de staff DENTRO de una transacción ya abierta: cuenta con
 * usuario y clave generados, ficha de administrativo (si se pide) y rol
 * inicial. Lo usan el alta de administrativos (aquí) y el de guías
 * (`scheduling`), que suma su ficha en la MISMA transacción.
 *
 * Quién puede otorgar el rol lo decide la RUTA (`requirePuedeOtorgarRol`).
 */
export async function crearCuentaStaffTx(
  tx: Queryable,
  datos: DatosCuentaStaff,
): Promise<CuentaCreada> {
  const nombres = datos.nombres.trim();
  const apellidos = datos.apellidos.trim();
  if (nombres === "" || apellidos === "") {
    throw new ValidationError(
      "Nombres y apellidos son obligatorios: con ellos se genera el usuario.",
    );
  }
  const email = datos.email?.trim().toLowerCase() || null;
  await exigirCorreoLibre(tx, email);

  const creada = await crearCuentaTx(tx, {
    base: baseUsername(nombres, apellidos, "staff"),
    email: () => email,
    emailSintetico: false,
    ...(datos.id !== undefined && { id: datos.id }),
  });
  if (datos.perfil != null) {
    await execute(
      `INSERT INTO identity_perfil (user_id, nombres, apellidos, telefono, doc_numero)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        creada.userId,
        nombres,
        apellidos,
        datos.perfil.telefono?.trim() || null,
        datos.perfil.docNumero?.trim().toUpperCase() || null,
      ],
      tx,
    );
  }
  if (datos.roleCode != null && datos.roleCode !== "") {
    await asignarRolTx(tx, {
      userId: creada.userId,
      roleCode: datos.roleCode,
      countryCode: datos.countryCode ?? null,
    });
  }
  return creada;
}

/**
 * Crea un usuario ADMINISTRATIVO (admin, coordinador o un rol creado en el
 * panel) con su ficha.
 *
 * Desde 2026-09-21 el usuario NO se escribe: se genera de los nombres y
 * apellidos igual que el de un alumno (`crearCuentaTx`), así nunca se repite.
 * La clave también se genera, se muestra UNA vez y hay que cambiarla al primer
 * ingreso. Todo en una transacción.
 * (El alta de ALUMNOS sigue siendo exclusiva del alta única de contratos, y la
 * del guía, con su ficha y su foto, está en `scheduling`.)
 */
export async function crearUsuarioStaff(input: {
  actorUserId: string;
  nombres: string;
  apellidos: string;
  email?: string | null;
  telefono?: string | null;
  docNumero?: string | null;
  roleCode?: string | null;
  countryCode?: string | null;
  ip?: string | null;
}): Promise<{ userId: string; username: string; passwordInicial: string }> {
  const cuenta = await withTransaction((tx) =>
    crearCuentaStaffTx(tx, {
      nombres: input.nombres,
      apellidos: input.apellidos,
      email: input.email ?? null,
      perfil: { telefono: input.telefono ?? null, docNumero: input.docNumero ?? null },
      roleCode: input.roleCode ?? null,
      countryCode: input.countryCode ?? null,
    }),
  );

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "identity.usuario_staff_creado",
    entidad: "identity_user",
    entidadId: cuenta.userId,
    payload: {
      username: cuenta.username,
      nombre: `${input.nombres.trim()} ${input.apellidos.trim()}`,
      rol: input.roleCode ?? null,
      pais: input.countryCode ?? null,
    },
    ip: input.ip ?? null,
  });
  return cuenta;
}
