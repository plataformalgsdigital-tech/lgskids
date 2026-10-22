import {
  anotarEnvioEnlaceClave,
  emitirEnlaceClave,
  enlaceClave,
  registrarSolicitudClave,
} from "@/modules/identity";
import { env } from "@/platform/config/env";
import { logger } from "@/platform/logging/logger";
import { enviarEnlaceClave } from "./mensajes";

/**
 * "¿Olvidaste tu clave?" (2026-10-21). Compone las dos mitades:
 *  1. `identity` REGISTRA la solicitud (el registro que ve el equipo en
 *     Usuarios y roles) y, si la cuenta existe y está ACTIVA, emite un enlace
 *     de un solo uso que vence en 24 h;
 *  2. aquí se manda por WhatsApp al teléfono YA registrado de la cuenta —el del
 *     apoderado si es un niño, el propio si es guía o administrativo— y se
 *     anota en la solicitud a dónde salió o por qué no.
 * Si no sale (sin teléfono, tope diario, plantilla apagada), la solicitud queda
 * PENDIENTE y la atiende el equipo como antes. Nada de esto cambia la respuesta
 * pública, que es siempre la misma: la puerta no revela qué cuentas existen.
 */
export async function registrarOlvidoClave(input: {
  usuario: string;
  contacto: string | null;
  ip: string | null;
}): Promise<SolicitudRegistrada> {
  return registrarSolicitudClave(input);
}

type SolicitudRegistrada = Awaited<ReturnType<typeof registrarSolicitudClave>>;

/**
 * El enlace por WhatsApp de una solicitud ya registrada. La ruta lo corre
 * DESPUÉS de responder (`after()`): así la respuesta tarda lo mismo exista o no
 * la cuenta, y el tiempo tampoco delata qué usuarios hay.
 */
export async function enviarEnlaceDeSolicitud(
  s: SolicitudRegistrada,
  ip: string | null,
): Promise<void> {
  if (s.userId === null || !s.cuentaActiva) return;
  const userId = s.userId;
  try {
    const emitido = await emitirEnlaceClave({ userId, solicitudId: s.solicitudId });
    if (emitido === null) {
      await anotarEnvioEnlaceClave({
        solicitudId: s.solicitudId,
        enviadoA: null,
        problema: "Ya se mandaron 3 enlaces en 24 horas: la atiende el equipo.",
      });
      return;
    }
    const r = await enviarEnlaceClave({
      userId,
      enlace: enlaceClave(env().APP_URL, emitido.token),
      ip,
    });
    await anotarEnvioEnlaceClave({
      solicitudId: s.solicitudId,
      enviadoA: r.enviadoA,
      problema: r.problema,
    });
  } catch (e) {
    // El registro ya quedó: un fallo del envío no debe tumbar la puerta.
    logger.warn("No se pudo mandar el enlace de clave", {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
    await anotarEnvioEnlaceClave({
      solicitudId: s.solicitudId,
      enviadoA: null,
      problema: "No se pudo enviar el WhatsApp: la atiende el equipo.",
    }).catch(() => undefined);
  }
}
