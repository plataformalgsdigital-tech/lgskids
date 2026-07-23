import { env } from "@/platform/config/env";
import { logger } from "@/platform/logging/logger";
import type { MensajeSaliente, NotificationSenderPort } from "../application/ports";

/** Desarrollo/CI: registra el mensaje en el log y lo da por enviado. */
export class LogSender implements NotificationSenderPort {
  async enviar(mensaje: MensajeSaliente): Promise<{ ok: boolean; error?: string }> {
    logger.info("NOTIFICACIÓN (LogSender — no se envía de verdad)", {
      canal: mensaje.canal,
      destinatario: mensaje.destinatario,
      mensaje: mensaje.mensaje,
    });
    return { ok: true };
  }
}

/**
 * Meta WhatsApp Cloud API (Fase 11): requiere WHATSAPP_TOKEN y
 * WHATSAPP_PHONE_ID en el entorno. Mientras falten, el selector usa LogSender.
 */
export class WhatsAppCloudSender implements NotificationSenderPort {
  constructor(
    private readonly token: string,
    private readonly phoneId: string,
  ) {}

  async enviar(mensaje: MensajeSaliente): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${this.phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: mensaje.destinatario,
          type: "text",
          text: { body: mensaje.mensaje },
        }),
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }
}

let sender: NotificationSenderPort | null = null;

/** Selector por configuración: WhatsApp real si hay credenciales; log si no. */
export function getSender(): NotificationSenderPort {
  if (sender === null) {
    const token = env().WHATSAPP_TOKEN;
    const phoneId = env().WHATSAPP_PHONE_ID;
    sender =
      token !== undefined && phoneId !== undefined
        ? new WhatsAppCloudSender(token, phoneId)
        : new LogSender();
  }
  return sender;
}

/** Solo para pruebas. */
export function setSenderForTests(impl: NotificationSenderPort | null): void {
  sender = impl;
}
