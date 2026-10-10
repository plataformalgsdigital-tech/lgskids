import { createHash, randomBytes } from "node:crypto";

/**
 * ENLACE DE CREACIÓN DE PERFIL (2026-10-10): el que recibe el apoderado al
 * aprobarse el contrato.
 *
 * El token ES la credencial: con él se fija la clave del niño. Por eso son 32
 * bytes al azar, de la base solo sale su HASH (el token vive únicamente en el
 * mensaje), sirve UNA vez y reenviarlo revoca el anterior. No vence: lo pidió
 * el negocio, y el uso único ya lo cierra.
 */

export function nuevoTokenPerfil(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTokenPerfil(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Forma de un token válido: corta el paso a la base de cualquier basura. */
export function pareceTokenPerfil(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function enlacePerfil(appUrl: string, token: string): string {
  return new URL(`/crear-perfil/${token}`, appUrl).toString();
}

export type EstadoEnlacePerfil = "VIGENTE" | "USADO" | "REVOCADO";

export function estadoEnlacePerfil(e: {
  usadoEn: string | null;
  revocadoEn: string | null;
}): EstadoEnlacePerfil {
  if (e.usadoEn !== null) return "USADO";
  if (e.revocadoEn !== null) return "REVOCADO";
  return "VIGENTE";
}

/** Textos del perfil: obligatorios y acotados. Devuelve el primer problema o null. */
export const LARGO_MAXIMO_TEXTO_PERFIL = 1000;

export function problemaTextoPerfil(rotulo: string, texto: string): string | null {
  const t = texto.trim();
  if (t === "") return `Falta "${rotulo}".`;
  if (t.length > LARGO_MAXIMO_TEXTO_PERFIL) {
    return `"${rotulo}" no puede pasar de ${String(LARGO_MAXIMO_TEXTO_PERFIL)} caracteres.`;
  }
  return null;
}
