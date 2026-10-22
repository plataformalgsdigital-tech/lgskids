import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import {
  HORAS_VIGENCIA_ENLACE_CLAVE,
  MAX_ENLACES_CLAVE_POR_DIA,
  estadoEnlaceClave,
  hashTokenClave,
  nuevoTokenClave,
  pareceTokenClave,
  type EstadoEnlaceClave,
} from "../domain/enlace-clave";
import {
  CLAVE_NINO_MIN,
  PASSWORD_MIN_LENGTH,
  problemaClaveNino,
  validarPassword,
} from "../domain/password-policy";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";
import { copiaCifrada } from "../infrastructure/boveda-claves";

/**
 * "¿Olvidaste tu clave?" POR WHATSAPP (2026-10-21). Quien pide la clave recibe,
 * en el teléfono YA registrado de la cuenta, un enlace para elegir una nueva.
 * La solicitud sigue quedando en `identity_solicitud_clave` como registro.
 *
 * Aquí vive solo lo de la CUENTA (emitir el enlace, leerlo, usarlo). A dónde se
 * manda y el WhatsApp mismo son de `notifications`, que compone las dos cosas.
 */

/** ¿La cuenta es de un alumno? (su clave sigue la regla del perfil: 8+ letras y números). */
async function esAlumno(userId: string): Promise<boolean> {
  const f = await queryOne<{ si: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM people_person WHERE user_id = $1) AS si`,
    [userId],
  );
  return f?.si === true;
}

/**
 * Emite un enlace para la cuenta (revoca el que hubiera vivo). Devuelve el
 * token, o null si la cuenta ya recibió `MAX_ENLACES_CLAVE_POR_DIA` en 24 h: la
 * solicitud queda igual registrada y la atiende el equipo.
 */
export async function emitirEnlaceClave(input: {
  userId: string;
  solicitudId: string | null;
}): Promise<{ token: string } | null> {
  const recientes = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM identity_enlace_clave
      WHERE user_id = $1 AND creado_en > now() - interval '24 hours'`,
    [input.userId],
  );
  if ((recientes?.n ?? 0) >= MAX_ENLACES_CLAVE_POR_DIA) return null;
  const token = nuevoTokenClave();
  await withTransaction(async (tx) => {
    await execute(
      `UPDATE identity_enlace_clave SET revocado_en = now()
        WHERE user_id = $1 AND usado_en IS NULL AND revocado_en IS NULL`,
      [input.userId],
      tx,
    );
    await execute(
      `INSERT INTO identity_enlace_clave (id, user_id, solicitud_id, token_hash, expira_en)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
      [
        newId(),
        input.userId,
        input.solicitudId,
        hashTokenClave(token),
        HORAS_VIGENCIA_ENLACE_CLAVE,
      ],
      tx,
    );
  });
  return { token };
}

/** Deja en la solicitud a dónde salió el enlace (tapado) o por qué no salió. */
export async function anotarEnvioEnlaceClave(input: {
  solicitudId: string;
  enviadoA: string | null;
  problema: string | null;
}): Promise<void> {
  await execute(
    `UPDATE identity_solicitud_clave
        SET enlace_enviado_a = $2,
            enlace_enviado_en = CASE WHEN $2::text IS NULL THEN enlace_enviado_en ELSE now() END,
            enlace_problema = $3
      WHERE id = $1`,
    [input.solicitudId, input.enviadoA, input.problema],
  );
}

export type FichaEnlaceClave =
  | { estado: "INVALIDO" }
  | { estado: Exclude<EstadoEnlaceClave, "VIGENTE"> }
  | { estado: "VIGENTE"; usuario: string; esAlumno: boolean; minimo: number };

interface FilaEnlace {
  id: string;
  userId: string;
  solicitudId: string | null;
  username: string;
  cuentaEstado: string;
  usadoEn: Date | null;
  revocadoEn: Date | null;
  expiraEn: Date;
}

const SELECT_ENLACE = `
  SELECT e.id, e.user_id AS "userId", e.solicitud_id AS "solicitudId", u.username,
         u.estado::text AS "cuentaEstado", e.usado_en AS "usadoEn",
         e.revocado_en AS "revocadoEn", e.expira_en AS "expiraEn"
    FROM identity_enlace_clave e JOIN identity_user u ON u.id = e.user_id
   WHERE e.token_hash = $1`;

/** Lo que muestra la página pública del enlace, sin entregar nada más. */
export async function fichaPorEnlaceClave(token: string): Promise<FichaEnlaceClave> {
  if (!pareceTokenClave(token)) return { estado: "INVALIDO" };
  const e = await queryOne<FilaEnlace>(SELECT_ENLACE, [hashTokenClave(token)]);
  if (e === null || e.cuentaEstado !== "ACTIVO") return { estado: "INVALIDO" };
  const estado = estadoEnlaceClave(e);
  if (estado !== "VIGENTE") return { estado };
  const alumno = await esAlumno(e.userId);
  return {
    estado,
    usuario: e.username,
    esAlumno: alumno,
    minimo: alumno ? CLAVE_NINO_MIN : PASSWORD_MIN_LENGTH,
  };
}

/**
 * Usa el enlace: fija la clave elegida (hash + copia en la bóveda, "cambiar
 * clave al entrar" APAGADO —la acaba de elegir—, sesiones cerradas), marca el
 * enlace USADO y la solicitud ATENDIDA "por enlace". Todo junto, bloqueando la
 * fila del enlace: dos envíos del mismo formulario no fijan dos claves.
 */
export async function usarEnlaceClave(input: {
  token: string;
  clave: string;
  confirmacion: string;
  ip?: string | null;
}): Promise<{ usuario: string }> {
  if (!pareceTokenClave(input.token)) throw new ConflictError("El enlace no es válido.");
  if (input.clave !== input.confirmacion) {
    throw new ValidationError("Las dos claves no coinciden.");
  }
  const previo = await queryOne<FilaEnlace>(SELECT_ENLACE, [hashTokenClave(input.token)]);
  if (previo === null || previo.cuentaEstado !== "ACTIVO") {
    throw new ConflictError("El enlace no es válido.");
  }
  if (await esAlumno(previo.userId)) {
    const problema = problemaClaveNino(input.clave);
    if (problema !== null) throw new ValidationError(problema);
  } else {
    try {
      validarPassword(input.clave);
    } catch (e) {
      // La página pública muestra el mensaje: que diga QUÉ le falta a la clave.
      const detalles = e instanceof ValidationError ? e.details : null;
      throw Array.isArray(detalles)
        ? new ValidationError(`La clave no sirve: ${detalles.join(" ")}`)
        : e;
    }
  }
  const hash = await new Argon2Hasher().hash(input.clave);

  const e = await withTransaction(async (tx) => {
    const fila = await queryOne<FilaEnlace>(`${SELECT_ENLACE} FOR UPDATE OF e`, [
      hashTokenClave(input.token),
    ]);
    if (fila === null) throw new ConflictError("El enlace no es válido.");
    const estado = estadoEnlaceClave(fila);
    if (estado === "USADO") throw new ConflictError("Este enlace ya se usó.");
    if (estado === "REVOCADO") {
      throw new ConflictError("Este enlace ya no sirve: se pidió uno más nuevo.");
    }
    if (estado === "VENCIDO") {
      throw new ConflictError("El enlace venció. Pide uno nuevo en “¿Olvidaste tu clave?”.");
    }
    await execute(
      `UPDATE identity_user
          SET password_hash = $2, password_cifrada = $3, debe_cambiar_password = false,
              updated_at = now()
        WHERE id = $1`,
      [fila.userId, hash, copiaCifrada(input.clave, fila.userId)],
      tx,
    );
    await execute(
      `UPDATE identity_refresh_token
          SET revocado_en = now(), motivo_revoque = 'clave elegida con el enlace'
        WHERE user_id = $1 AND revocado_en IS NULL`,
      [fila.userId],
      tx,
    );
    await execute(`UPDATE identity_enlace_clave SET usado_en = now() WHERE id = $1`, [fila.id], tx);
    await execute(
      `UPDATE identity_solicitud_clave
          SET estado = 'ATENDIDA', atendida_en = now(), resuelta_por_enlace = true
        WHERE user_id = $1 AND estado = 'PENDIENTE'`,
      [fila.userId],
      tx,
    );
    return fila;
  });

  await registrarAuditoria({
    actorUserId: e.userId,
    accion: "identity.clave_restablecida_por_enlace",
    entidad: "identity_user",
    entidadId: e.userId,
    payload: { username: e.username },
    ip: input.ip ?? null,
  });
  return { usuario: e.username };
}
