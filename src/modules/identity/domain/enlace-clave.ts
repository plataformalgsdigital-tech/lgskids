import { createHash, randomBytes } from "node:crypto";

/**
 * ENLACE PARA ELEGIR CLAVE NUEVA (2026-10-21): lo que llega por WhatsApp cuando
 * alguien pide "¿Olvidaste tu clave?" en la entrada.
 *
 * El token ES la credencial: con él se fija la clave de la cuenta. Por eso son
 * 32 bytes al azar, de la base solo sale su HASH (el token vive únicamente en el
 * mensaje), sirve UNA vez, pedir otro revoca el anterior y VENCE en 24 horas
 * (a diferencia del enlace de perfil, este se pide cuando se necesita).
 */

export const HORAS_VIGENCIA_ENLACE_CLAVE = 24;
/** Enlaces por cuenta en 24 h: que nadie le llene el WhatsApp a una familia. */
export const MAX_ENLACES_CLAVE_POR_DIA = 3;

export function nuevoTokenClave(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTokenClave(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Forma de un token válido: corta el paso a la base de cualquier basura. */
export function pareceTokenClave(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function enlaceClave(appUrl: string, token: string): string {
  return new URL(`/restablecer-clave/${token}`, appUrl).toString();
}

export type EstadoEnlaceClave = "VIGENTE" | "USADO" | "REVOCADO" | "VENCIDO";

export function estadoEnlaceClave(
  e: { usadoEn: Date | string | null; revocadoEn: Date | string | null; expiraEn: Date | string },
  ahora: Date = new Date(),
): EstadoEnlaceClave {
  if (e.usadoEn !== null) return "USADO";
  if (e.revocadoEn !== null) return "REVOCADO";
  if (new Date(e.expiraEn).getTime() <= ahora.getTime()) return "VENCIDO";
  return "VIGENTE";
}

/** El teléfono a la vista sin entregarlo entero: "•••• 9216". */
export function telefonoTapado(numero: string): string {
  return `•••• ${numero.slice(-4)}`;
}
