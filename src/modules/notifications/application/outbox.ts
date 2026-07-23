import { execute, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { logger } from "@/platform/logging/logger";
import type { Canal } from "./ports";
import { getSender } from "../infrastructure/senders";

/**
 * OUTBOX de notificaciones: encolar es barato y transaccional-friendly; el
 * envío real lo hace el worker con reintentos. Un fallo del proveedor de
 * WhatsApp jamás rompe una operación de negocio.
 */

const MAX_INTENTOS = 5;

export async function encolarNotificacion(input: {
  canal: Canal;
  destinatario: string;
  mensaje: string;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO notifications_outbox (id, canal, destinatario, mensaje, payload)
     VALUES ($1, $2::notifications_canal, $3, $4, $5)`,
    [
      id,
      input.canal,
      input.destinatario,
      input.mensaje,
      input.payload !== undefined ? JSON.stringify(input.payload) : null,
    ],
  );
  return id;
}

/** Worker: despacha pendientes (y fallidas con intentos < MAX). Idempotente. */
export async function procesarOutbox(limit = 50): Promise<{ enviadas: number; fallidas: number }> {
  interface Row {
    id: string;
    canal: Canal;
    destinatario: string;
    mensaje: string;
    intentos: number;
  }
  const pendientes = await queryRows<Row>(
    `SELECT id, canal::text AS canal, destinatario, mensaje, intentos
       FROM notifications_outbox
      WHERE estado = 'PENDIENTE' OR (estado = 'FALLIDA' AND intentos < $1)
      ORDER BY created_at
      LIMIT $2`,
    [MAX_INTENTOS, limit],
  );

  let enviadas = 0;
  let fallidas = 0;
  const sender = getSender();
  for (const noti of pendientes) {
    const resultado = await sender.enviar({
      canal: noti.canal,
      destinatario: noti.destinatario,
      mensaje: noti.mensaje,
    });
    if (resultado.ok) {
      await execute(
        `UPDATE notifications_outbox
            SET estado = 'ENVIADA', enviada_en = now(), intentos = intentos + 1
          WHERE id = $1`,
        [noti.id],
      );
      enviadas += 1;
    } else {
      await execute(
        `UPDATE notifications_outbox
            SET estado = 'FALLIDA', intentos = intentos + 1, ultimo_error = $2
          WHERE id = $1`,
        [noti.id, resultado.error ?? "desconocido"],
      );
      fallidas += 1;
      logger.warn("Notificación falló", { id: noti.id, error: resultado.error });
    }
  }
  return { enviadas, fallidas };
}

/**
 * Encola los PREMIOS pendientes de aviso (medallas/diplomas con
 * notificado_en NULL): arma el mensaje al WhatsApp REAL del apoderado y
 * marca el premio como notificado. Idempotente.
 */
export async function notificarPremiosPendientes(): Promise<number> {
  interface Premio {
    id: string;
    tipo: "MEDALLA" | "DIPLOMA";
    nino: string;
    nivel: string | null;
    telefono: string | null;
  }
  const premios = await queryRows<Premio>(
    `SELECT a.id, a.tipo::text AS tipo,
            p.nombres || ' ' || p.apellidos AS nino,
            n.nombre AS nivel,
            (SELECT ap.telefono
               FROM people_guardianship g
               JOIN people_person ap ON ap.id = g.apoderado_id
              WHERE g.nino_id = p.id AND ap.telefono IS NOT NULL
              LIMIT 1) AS telefono
       FROM progression_award a
       JOIN people_person p ON p.id = a.child_person_id
       LEFT JOIN catalog_level n ON n.id = a.level_id
      WHERE a.notificado_en IS NULL
      ORDER BY a.otorgado_en
      LIMIT 100`,
  );

  let encoladas = 0;
  for (const premio of premios) {
    if (premio.telefono !== null) {
      const mensaje =
        premio.tipo === "DIPLOMA"
          ? `🎓 ¡Felicitaciones! ${premio.nino} completó su curso en LGS Kids y obtuvo su DIPLOMA. ¡Estamos muy orgullosos!`
          : `🏅 ¡${premio.nino} completó el nivel ${premio.nivel ?? ""} en LGS Kids y ganó una medalla! Sigue así.`;
      await encolarNotificacion({
        canal: "WHATSAPP",
        destinatario: premio.telefono,
        mensaje,
        payload: { awardId: premio.id, tipo: premio.tipo },
      });
      encoladas += 1;
    } else {
      logger.warn("Premio sin teléfono de apoderado; se marca notificado sin envío", {
        awardId: premio.id,
      });
    }
    await execute(`UPDATE progression_award SET notificado_en = now() WHERE id = $1`, [premio.id]);
  }
  return encoladas;
}
