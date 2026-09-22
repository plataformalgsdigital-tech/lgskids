import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { NotFoundError, TooManyRequestsError } from "@/platform/errors";
import { newId } from "@/platform/ids";

/**
 * "¿Olvidaste tu clave?" (2026-09-21, decisión del negocio: solicitud al
 * equipo). La persona deja su usuario —y si quiere, cómo contactarla— y el
 * equipo la ve en Usuarios, restablece la clave y se la entrega (p. ej. por
 * WhatsApp). Al entrar con la clave nueva se le pide cambiarla.
 *
 * No hay correo de recuperación a propósito: los niños tienen un correo
 * sintético que no recibe nada, y la plataforma no envía correo.
 */

/** Pedidos por IP por hora: la puerta es pública. */
export const MAX_SOLICITUDES_POR_IP_HORA = 5;

/**
 * Registra la solicitud. La respuesta pública es la MISMA exista o no el
 * usuario (no se revela qué cuentas existen); se guarda `user_id` solo si
 * coincide, para que el equipo sepa a quién restablecer. Si la cuenta ya tenía
 * una solicitud pendiente se renueva en vez de duplicarse.
 */
export async function registrarSolicitudClave(input: {
  usuario: string;
  contacto?: string | null;
  ip: string | null;
}): Promise<void> {
  const usuario = input.usuario.trim().toLowerCase().slice(0, 60);
  const contacto = input.contacto?.trim().slice(0, 200) || null;

  if (input.ip !== null) {
    const recientes = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM identity_solicitud_clave
        WHERE ip = $1 AND creada_en > now() - interval '1 hour'`,
      [input.ip],
    );
    if ((recientes?.n ?? 0) >= MAX_SOLICITUDES_POR_IP_HORA) {
      throw new TooManyRequestsError("Demasiadas solicitudes. Intenta en una hora.");
    }
  }

  const cuenta = await queryOne<{ id: string }>(
    `SELECT id FROM identity_user WHERE username = $1`,
    [usuario],
  );
  const id = newId();
  if (cuenta === null) {
    await execute(
      `INSERT INTO identity_solicitud_clave (id, username_ingresado, contacto, ip)
       VALUES ($1, $2, $3, $4)`,
      [id, usuario, contacto, input.ip],
    );
  } else {
    await execute(
      `INSERT INTO identity_solicitud_clave (id, username_ingresado, user_id, contacto, ip)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) WHERE estado = 'PENDIENTE' AND user_id IS NOT NULL
       DO UPDATE SET creada_en = now(),
                     contacto = COALESCE(EXCLUDED.contacto, identity_solicitud_clave.contacto),
                     ip = EXCLUDED.ip`,
      [id, usuario, cuenta.id, contacto, input.ip],
    );
  }
  await registrarAuditoria({
    actorUserId: null,
    accion: "identity.clave_solicitada",
    entidad: "identity_user",
    entidadId: cuenta?.id ?? null,
    payload: { usuario, existe: cuenta !== null },
    ip: input.ip,
  });
}

export interface SolicitudClave {
  id: string;
  usuarioIngresado: string;
  userId: string | null;
  /** Nombre de la cuenta, si el usuario existe. */
  nombre: string | null;
  contacto: string | null;
  creadaEn: Date;
}

/** Solicitudes PENDIENTES, la más reciente primero. */
export async function listarSolicitudesClave(): Promise<SolicitudClave[]> {
  return queryRows<SolicitudClave>(
    `SELECT s.id, s.username_ingresado AS "usuarioIngresado", s.user_id AS "userId",
            COALESCE(p.nombres || ' ' || p.apellidos,
                     g.nombres || ' ' || g.apellidos,
                     pf.nombres || ' ' || pf.apellidos) AS nombre,
            s.contacto, s.creada_en AS "creadaEn"
       FROM identity_solicitud_clave s
       LEFT JOIN people_person p ON p.user_id = s.user_id
       LEFT JOIN scheduling_guia g ON g.guia_user_id = s.user_id
       LEFT JOIN identity_perfil pf ON pf.user_id = s.user_id
      WHERE s.estado = 'PENDIENTE'
      ORDER BY s.creada_en DESC
      LIMIT 100`,
  );
}

/** Descarta una solicitud (no se atiende: usuario inexistente, broma…). */
export async function descartarSolicitudClave(input: {
  actorUserId: string;
  id: string;
}): Promise<void> {
  const n = await execute(
    `UPDATE identity_solicitud_clave
        SET estado = 'DESCARTADA', atendida_en = now(), atendida_por = $2
      WHERE id = $1 AND estado = 'PENDIENTE'`,
    [input.id, input.actorUserId],
  );
  if (n === 0) throw new NotFoundError("La solicitud no existe o ya se atendió.");
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "identity.solicitud_clave_descartada",
    entidad: "identity_solicitud_clave",
    entidadId: input.id,
  });
}
