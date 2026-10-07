import { env } from "@/platform/config/env";
import { logger } from "@/platform/logging/logger";
import type { MensajeSaliente, NotificationSenderPort } from "../application/ports";

/**
 * Desarrollo/CI: lo da por enviado y deja constancia en el log, SIN el texto:
 * el mensaje de credenciales lleva la clave del niño, y el log del servidor no
 * es lugar para ella (lo que se envió, sin la clave, queda en el historial).
 */
export class LogSender implements NotificationSenderPort {
  async enviar(mensaje: MensajeSaliente): Promise<{ ok: boolean; error?: string }> {
    logger.info("NOTIFICACIÓN (LogSender — no se envía de verdad)", {
      canal: mensaje.canal,
      destinatario: mensaje.destinatario,
      caracteres: mensaje.mensaje.length,
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

/**
 * Whapi.cloud (2026-10-07): el MISMO servicio de WhatsApp que usa LGS. Texto
 * libre —la plantilla ya viene rellenada—, al número con indicativo y solo
 * dígitos. Un token es un canal (un número de WhatsApp).
 */
export class WhapiSender implements NotificationSenderPort {
  constructor(private readonly token: string) {}

  async enviar(mensaje: MensajeSaliente): Promise<{ ok: boolean; error?: string }> {
    if (mensaje.canal !== "WHATSAPP") {
      return { ok: false, error: `Whapi solo envía WhatsApp, no ${mensaje.canal}.` };
    }
    try {
      const res = await fetch("https://gate.whapi.cloud/messages/text", {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ typing_time: 0, to: mensaje.destinatario, body: mensaje.mensaje }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const texto = await res.text();
        let detalle = texto;
        try {
          const j = JSON.parse(texto) as {
            message?: string;
            error?: { message?: string } | string;
          };
          detalle =
            j.message ?? (typeof j.error === "string" ? j.error : j.error?.message) ?? texto;
        } catch {
          // la respuesta no era JSON: se deja el texto tal cual
        }
        return { ok: false, error: `WhatsApp (${String(res.status)}): ${detalle.slice(0, 300)}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }
}

let sender: NotificationSenderPort | null = null;

export type ProveedorWhatsApp = "WHAPI" | "META" | "SIMULADO";

/** Qué proveedor está activo: la pantalla avisa cuando los envíos son simulados. */
export function proveedorActivo(): ProveedorWhatsApp {
  if (env().WHAPI_TOKEN !== undefined) return "WHAPI";
  if (env().WHATSAPP_TOKEN !== undefined && env().WHATSAPP_PHONE_ID !== undefined) return "META";
  return "SIMULADO";
}

/** Selector por configuración: Whapi (el de LGS), Meta, o el log si no hay nada. */
export function getSender(): NotificationSenderPort {
  if (sender === null) {
    const whapi = env().WHAPI_TOKEN;
    const token = env().WHATSAPP_TOKEN;
    const phoneId = env().WHATSAPP_PHONE_ID;
    sender =
      whapi !== undefined
        ? new WhapiSender(whapi)
        : token !== undefined && phoneId !== undefined
          ? new WhatsAppCloudSender(token, phoneId)
          : new LogSender();
  }
  return sender;
}

/** Solo para pruebas. */
export function setSenderForTests(impl: NotificationSenderPort | null): void {
  sender = impl;
}
