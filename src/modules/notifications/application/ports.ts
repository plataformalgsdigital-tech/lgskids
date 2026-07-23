/** PUERTOS del módulo notifications. */

export type Canal = "WHATSAPP" | "EMAIL";

export interface MensajeSaliente {
  canal: Canal;
  destinatario: string; // E.164 o correo REAL (nunca el sintético)
  mensaje: string;
}

/**
 * Puerto de envío. Adaptadores:
 * - LogSender (desarrollo/CI): escribe al log, siempre "envía".
 * - WhatsAppCloudSender (Fase 11): Meta WhatsApp Cloud API con credenciales
 *   reales — la interfaz ya está fijada, solo se enchufa.
 */
export interface NotificationSenderPort {
  enviar(mensaje: MensajeSaliente): Promise<{ ok: boolean; error?: string }>;
}
