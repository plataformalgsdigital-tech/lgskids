import { registrarAuditoria } from "@/modules/audit";
import { eliminarArchivo } from "@/modules/files";
import { llaveBovedaClaves } from "@/platform/config/env";
import { execute, queryOne } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";
import { generarPasswordInicial } from "../domain/credenciales";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";
import { copiaCifrada, descifrarClave } from "../infrastructure/boveda-claves";
import { exigirCorreoLibre } from "./crear-usuario";
import { inactivarUsuarioTx, reactivarUsuarioTx } from "./provisionar-alumno";

/** Cuenta técnica de la puerta de LGS: la auditoría del intake cuelga de ella. */
const USUARIO_SISTEMA = "sistema-lgs";

/**
 * Administración de la CUENTA de otro usuario desde el panel. QUIÉN puede
 * hacerlo (según los roles del otro) lo decide la ruta con
 * `requirePuedeGestionarCuentaDe`; consultar la clave, además, es solo del
 * ROL superadmin (`esSuperadmin`).
 */

async function cuenta(userId: string): Promise<{ username: string }> {
  const fila = await queryOne<{ username: string }>(
    `SELECT username FROM identity_user WHERE id = $1`,
    [userId],
  );
  if (fila === null) throw new NotFoundError("El usuario no existe.");
  return fila;
}

/**
 * RESTABLECE la clave: genera una nueva (se muestra UNA vez para entregarla),
 * enciende "debe cambiar clave" para que el usuario ponga la suya al entrar,
 * cierra todas sus sesiones y da por atendida su solicitud de "olvidé mi
 * clave", si tenía una. Todo en una transacción.
 */
export async function restablecerClave(input: {
  actorUserId: string;
  userId: string;
  ip?: string | null;
}): Promise<{ username: string; clave: string }> {
  const { username } = await cuenta(input.userId);
  const clave = generarPasswordInicial();
  const hash = await new Argon2Hasher().hash(clave);

  await withTransaction(async (tx) => {
    await execute(
      `UPDATE identity_user
          SET password_hash = $2, password_cifrada = $3, debe_cambiar_password = true,
              updated_at = now()
        WHERE id = $1`,
      [input.userId, hash, copiaCifrada(clave, input.userId)],
      tx,
    );
    await execute(
      `UPDATE identity_refresh_token
          SET revocado_en = now(), motivo_revoque = 'clave restablecida'
        WHERE user_id = $1 AND revocado_en IS NULL`,
      [input.userId],
      tx,
    );
    await execute(
      `UPDATE identity_solicitud_clave
          SET estado = 'ATENDIDA', atendida_en = now(), atendida_por = $2
        WHERE user_id = $1 AND estado = 'PENDIENTE'`,
      [input.userId, input.actorUserId],
      tx,
    );
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "identity.clave_restablecida",
    entidad: "identity_user",
    entidadId: input.userId,
    payload: { username },
    ip: input.ip ?? null,
  });
  return { username, clave };
}

/** Prende o apaga "debe cambiar clave al entrar". */
export async function fijarDebeCambiarClave(input: {
  actorUserId: string;
  userId: string;
  valor: boolean;
  ip?: string | null;
}): Promise<void> {
  const { username } = await cuenta(input.userId);
  await execute(
    `UPDATE identity_user SET debe_cambiar_password = $2, updated_at = now() WHERE id = $1`,
    [input.userId, input.valor],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: input.valor ? "identity.debe_cambiar_encendido" : "identity.debe_cambiar_apagado",
    entidad: "identity_user",
    entidadId: input.userId,
    payload: { username },
    ip: input.ip ?? null,
  });
}

export type ConsultaClave =
  { clave: string } | { clave: null; motivo: "SIN_COPIA" | "BOVEDA_APAGADA" | "ILEGIBLE" };

/**
 * CONSULTA la clave de un usuario (solo superadmin; lo exige la ruta). Cada
 * consulta queda en auditoría —también las que no devuelven nada—: saber
 * quién miró la clave de quién es la contrapartida de poder mirarla.
 *
 * - SIN_COPIA: la cuenta es anterior a la bóveda (o se cambió la clave con la
 *   bóveda apagada). Restablecerla genera una con copia.
 * - BOVEDA_APAGADA: falta `PASSWORD_VAULT_KEY`.
 * - ILEGIBLE: la copia no se pudo descifrar (se cambió la llave, o la copia
 *   fue alterada). Restablecer la repone.
 */
export async function consultarClave(input: {
  actorUserId: string;
  userId: string;
  ip?: string | null;
}): Promise<ConsultaClave> {
  const fila = await queryOne<{ username: string; cifrada: string | null }>(
    `SELECT username, password_cifrada AS cifrada FROM identity_user WHERE id = $1`,
    [input.userId],
  );
  if (fila === null) throw new NotFoundError("El usuario no existe.");

  const llave = llaveBovedaClaves();
  let resultado: ConsultaClave;
  if (llave === null) resultado = { clave: null, motivo: "BOVEDA_APAGADA" };
  else if (fila.cifrada === null) resultado = { clave: null, motivo: "SIN_COPIA" };
  else {
    try {
      resultado = { clave: descifrarClave(fila.cifrada, input.userId, llave) };
    } catch {
      resultado = { clave: null, motivo: "ILEGIBLE" };
    }
  }

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "identity.clave_consultada",
    entidad: "identity_user",
    entidadId: input.userId,
    payload: {
      username: fila.username,
      resultado: resultado.clave === null ? resultado.motivo : "MOSTRADA",
    },
    ip: input.ip ?? null,
  });
  return resultado;
}

// —— Estado, ficha y borrado ————————————————————————————————————————————

/** La cuenta del alumno cuelga de su persona: su estado lo manda el contrato. */
async function esCuentaDeAlumno(userId: string): Promise<boolean> {
  const fila = await queryOne<{ si: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM people_person WHERE user_id = $1) AS si`,
    [userId],
  );
  return fila?.si === true;
}

function exigirOtraCuenta(actorUserId: string, userId: string, username: string): void {
  if (actorUserId === userId) {
    throw new ValidationError("No puedes hacer esto con tu propia cuenta.");
  }
  if (username === USUARIO_SISTEMA) {
    throw new ConflictError(
      "La cuenta sistema-lgs es de la puerta de LGS: sin ella el intake no puede registrar nada.",
    );
  }
}

/**
 * INACTIVA o REACTIVA una cuenta de staff o de guía. Inactivar cierra sus
 * sesiones: el autenticador rechaza a los no ACTIVOS en cada petición.
 *
 * La del ALUMNO no se toca aquí: se activa al aprobar su contrato y se apaga al
 * vencer o inactivarlo. Si el panel pudiera reactivarla, un niño con el
 * contrato vencido volvería a entrar.
 */
export async function cambiarEstadoCuenta(input: {
  actorUserId: string;
  userId: string;
  estado: "ACTIVO" | "INACTIVO";
  ip?: string | null;
}): Promise<void> {
  const { username } = await cuenta(input.userId);
  exigirOtraCuenta(input.actorUserId, input.userId, username);
  if (await esCuentaDeAlumno(input.userId)) {
    throw new ConflictError(
      "La cuenta del alumno sigue a su contrato: se activa al aprobarlo y se apaga al vencer o inactivarlo. Gestiónala desde Contratos.",
    );
  }
  await withTransaction(async (tx) => {
    if (input.estado === "INACTIVO") await inactivarUsuarioTx(tx, input.userId);
    else await reactivarUsuarioTx(tx, input.userId);
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion:
      input.estado === "INACTIVO" ? "identity.cuenta_inactivada" : "identity.cuenta_reactivada",
    entidad: "identity_user",
    entidadId: input.userId,
    payload: { username },
    ip: input.ip ?? null,
  });
}

/**
 * Edita la ficha del ADMINISTRATIVO (`identity_perfil`) y su correo. El
 * alumno se edita en su ficha de persona (Kids) y el guía en la suya (Guías):
 * cada dato vive en un solo lugar.
 */
export async function actualizarFichaAdministrativo(input: {
  actorUserId: string;
  userId: string;
  nombres: string;
  apellidos: string;
  email: string | null;
  telefono: string | null;
  docNumero: string | null;
  ip?: string | null;
}): Promise<void> {
  const { username } = await cuenta(input.userId);
  if (await esCuentaDeAlumno(input.userId)) {
    throw new ConflictError("Los datos del alumno se editan en su ficha (Kids).");
  }
  const guia = await queryOne<{ si: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM scheduling_guia WHERE guia_user_id = $1) AS si`,
    [input.userId],
  );
  if (guia?.si === true) {
    throw new ConflictError("Los datos del guía se editan en su ficha (Guías).");
  }
  const nombres = input.nombres.trim();
  const apellidos = input.apellidos.trim();
  if (nombres === "" || apellidos === "") {
    throw new ValidationError("Nombres y apellidos son obligatorios.");
  }
  const email = input.email?.trim().toLowerCase() || null;

  await withTransaction(async (tx) => {
    await exigirCorreoLibre(tx, email, input.userId);
    await execute(
      `UPDATE identity_user SET email = $2, updated_at = now() WHERE id = $1`,
      [input.userId, email],
      tx,
    );
    await execute(
      `INSERT INTO identity_perfil (user_id, nombres, apellidos, telefono, doc_numero, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE
          SET nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos,
              telefono = EXCLUDED.telefono, doc_numero = EXCLUDED.doc_numero,
              actualizado_en = now()`,
      [
        input.userId,
        nombres,
        apellidos,
        input.telefono?.trim() || null,
        input.docNumero?.trim().toUpperCase() || null,
      ],
      tx,
    );
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "identity.ficha_administrativo_editada",
    entidad: "identity_user",
    entidadId: input.userId,
    payload: { username },
    ip: input.ip ?? null,
  });
}

/**
 * Qué impide BORRAR una cuenta. Borrarla se llevaría en cascada lo que cuelga
 * de ella (la estadística mensual del guía, por ejemplo) y dejaría sin autor
 * sesiones y eventos. Una cuenta con historia se INACTIVA; se borra solo la
 * que se creó por error y nunca se usó.
 *
 * La lista de usuarios usa este MISMO fragmento para decidir si muestra el
 * botón "Eliminar", así la pantalla y la regla no pueden discrepar.
 */
export const SQL_MOTIVOS_NO_BORRAR = (u: string) => `
  ARRAY_REMOVE(ARRAY[
    CASE WHEN ${u}.ultimo_login_en IS NOT NULL THEN 'ya entró a la plataforma' END,
    CASE WHEN EXISTS (SELECT 1 FROM people_person pp WHERE pp.user_id = ${u}.id)
         THEN 'es la cuenta de un alumno' END,
    CASE WHEN EXISTS (SELECT 1 FROM scheduling_classroom sc WHERE sc.guia_user_id = ${u}.id)
         THEN 'tiene salones asignados' END,
    CASE WHEN EXISTS (SELECT 1 FROM scheduling_session ss
                       WHERE ss.guia_user_id = ${u}.id OR ss.cerrada_por = ${u}.id)
         THEN 'dictó o cerró sesiones' END,
    CASE WHEN EXISTS (SELECT 1 FROM reporting_guia_mes rg WHERE rg.guia_user_id = ${u}.id)
         THEN 'tiene estadística mensual' END,
    CASE WHEN EXISTS (SELECT 1 FROM scheduling_evento_admin ea WHERE ea.creado_por = ${u}.id)
           OR EXISTS (SELECT 1 FROM scheduling_evento_admin_guia eg WHERE eg.marcado_por = ${u}.id)
           OR EXISTS (SELECT 1 FROM scheduling_repeticion sr
                       WHERE sr.solicitado_por = ${u}.id OR sr.resuelto_por = ${u}.id)
           OR EXISTS (SELECT 1 FROM scheduling_guia_invitacion gi WHERE gi.creado_por = ${u}.id)
         THEN 'creó o gestionó eventos, refuerzos o enlaces' END
  ], NULL)`;

/** Borra una cuenta SIN historia (ver `SQL_MOTIVOS_NO_BORRAR`). */
export async function eliminarCuenta(input: {
  actorUserId: string;
  userId: string;
  ip?: string | null;
}): Promise<void> {
  const fila = await queryOne<{ username: string; motivos: string[]; foto: string | null }>(
    `SELECT u.username, ${SQL_MOTIVOS_NO_BORRAR("u")} AS motivos,
            (SELECT g.foto_file_id FROM scheduling_guia g WHERE g.guia_user_id = u.id) AS foto
       FROM identity_user u WHERE u.id = $1`,
    [input.userId],
  );
  if (fila === null) throw new NotFoundError("El usuario no existe.");
  exigirOtraCuenta(input.actorUserId, input.userId, fila.username);
  if (fila.motivos.length > 0) {
    throw new ConflictError(
      `No se puede eliminar ${fila.username}: ${fila.motivos.join(", ")}. Inactívala en su lugar.`,
    );
  }
  // Roles, ficha, sesiones, solicitudes y enlaces caen en cascada.
  await execute(`DELETE FROM identity_user WHERE id = $1`, [input.userId]);
  if (fila.foto !== null) {
    // La foto del guía no cuelga de la cuenta por clave foránea: se suelta
    // aparte. Si falla, queda un archivo huérfano, no una cuenta a medias.
    await eliminarArchivo(fila.foto).catch((e: unknown) => {
      logger.warn("No se pudo borrar la foto del guía eliminado", {
        fileId: fila.foto,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  }
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "identity.cuenta_eliminada",
    entidad: "identity_user",
    entidadId: input.userId,
    payload: { username: fila.username },
    ip: input.ip ?? null,
  });
}
