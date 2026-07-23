import { randomInt } from "node:crypto";
import { asignarRolTx } from "@/modules/access";
import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import { newId, randomDigits } from "@/platform/ids";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";

/** Contraseña inicial legible (misma receta que el alta de alumnos). */
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
 * Crea un usuario de STAFF (coordinador, guía, rol de consulta, etc.) con
 * contraseña inicial autogenerada (se muestra UNA vez) y cambio forzado al
 * primer ingreso. Rol inicial opcional, todo en una transacción.
 *
 * (El alta de ALUMNOS sigue siendo exclusiva del alta única de contratos.)
 */
export async function crearUsuarioStaff(input: {
  actorUserId: string;
  username: string;
  email?: string | null;
  roleCode?: string | null;
  countryCode?: string | null;
  ip?: string | null;
}): Promise<{ userId: string; username: string; passwordInicial: string }> {
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new ValidationError(
      "El usuario debe tener 3–40 caracteres: letras minúsculas, números, punto, guion o guion bajo.",
    );
  }
  const existente = await queryOne<{ id: string }>(
    `SELECT id FROM identity_user WHERE username = $1`,
    [username],
  );
  if (existente !== null) {
    throw new ConflictError(`El usuario '${username}' ya existe.`);
  }

  const passwordInicial = generarPasswordInicial();
  const passwordHash = await new Argon2Hasher().hash(passwordInicial);
  const userId = newId();

  await withTransaction(async (tx) => {
    await execute(
      `INSERT INTO identity_user
         (id, username, email, password_hash, estado, debe_cambiar_password, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVO', true, now())`,
      [userId, username, input.email?.trim() || null, passwordHash],
      tx,
    );
    if (input.roleCode != null && input.roleCode !== "") {
      await asignarRolTx(tx, {
        userId,
        roleCode: input.roleCode,
        countryCode: input.countryCode ?? null,
      });
    }
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "identity.usuario_staff_creado",
    entidad: "identity_user",
    entidadId: userId,
    payload: { username, rol: input.roleCode ?? null, pais: input.countryCode ?? null },
    ip: input.ip ?? null,
  });
  return { userId, username, passwordInicial };
}
