import { createHash, randomBytes } from "node:crypto";

/**
 * Enlace de registro del guía (wizard /nuevo-guia).
 *
 * En MOSAICO la página es ABIERTA: quien tenga la URL se da de alta como guía.
 * Aquí no: el enlace lleva un token ligado a UN guía, de un solo uso y con
 * vencimiento. La cuenta ya la creó administración en Usuarios y roles; el
 * wizard solo completa la ficha.
 *
 * Reglas puras: generar el token, resumirlo para guardarlo y decidir en qué
 * estado está. Nada de esto toca la base.
 */

/** Vigencia del enlace: una semana de margen para coordinar con el guía. */
export const DIAS_VIGENCIA_INVITACION = 7;

/**
 * Token que viaja en la URL. 32 bytes de azar criptográfico: adivinarlo no es
 * una posibilidad práctica, que es lo que sostiene la puerta pública.
 */
export function nuevoTokenInvitacion(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Lo ÚNICO que se guarda. No es una contraseña sino 32 bytes al azar, así que
 * un sha256 sin sal basta: no hay diccionario que atacar.
 */
export function hashTokenInvitacion(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type EstadoInvitacion = "VIGENTE" | "USADA" | "REVOCADA" | "VENCIDA";

export interface DatosVigencia {
  expiraEn: Date;
  usadoEn: Date | null;
  revocadoEn: Date | null;
}

/** Estado del enlace a una fecha dada. El orden importa: usada gana a vencida. */
export function estadoInvitacion(d: DatosVigencia, ahora: Date = new Date()): EstadoInvitacion {
  if (d.usadoEn !== null) return "USADA";
  if (d.revocadoEn !== null) return "REVOCADA";
  if (d.expiraEn.getTime() <= ahora.getTime()) return "VENCIDA";
  return "VIGENTE";
}

/** Fecha de vencimiento de un enlace emitido ahora. */
export function vencimientoInvitacion(desde: Date = new Date()): Date {
  return new Date(desde.getTime() + DIAS_VIGENCIA_INVITACION * 24 * 60 * 60 * 1000);
}

/** El enlace que recibe el guía. */
export function enlaceInvitacion(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/nuevo-guia?t=${encodeURIComponent(token)}`;
}

/** Mensaje único por estado: la puerta pública no explica de más. */
export const MENSAJE_INVITACION: Record<Exclude<EstadoInvitacion, "VIGENTE">, string> = {
  USADA: "Este enlace ya se usó. Si necesitas corregir tus datos, pídele a tu coordinación uno nuevo.",
  REVOCADA: "Este enlace ya no está disponible. Pídele a tu coordinación uno nuevo.",
  VENCIDA: "Este enlace venció. Pídele a tu coordinación uno nuevo.",
};
