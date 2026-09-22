import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { llaveBovedaClaves } from "@/platform/config/env";

/**
 * BÓVEDA DE CLAVES — copia recuperable de cada contraseña.
 *
 * Decisión del negocio (2026-09-21): el superadmin puede CONSULTAR cualquier
 * clave. Se advirtió el costo: si se filtran a la vez la base y la llave, todas
 * las claves quedan expuestas, y la gente reutiliza su clave en otros sitios.
 * Lo que se hizo para acotarlo:
 * - El acceso NO cambia: se verifica contra el hash argon2id. Esta copia solo
 *   sirve para mostrarla; perderla no deja a nadie fuera.
 * - AES-256-GCM (cifra y además detecta cualquier alteración) con IV al azar
 *   por clave, y la llave (`PASSWORD_VAULT_KEY`) vive FUERA de la base.
 * - La copia va atada a SU cuenta (el id del usuario como dato autenticado):
 *   copiarla a otra fila no la hace legible como si fuera de otra persona.
 * - Consultarla es solo del ROL superadmin y queda en auditoría (ver
 *   `gestion-cuentas.ts`).
 *
 * Formato: `v1:<iv>:<tag>:<cifrado>` (base64).
 */
const VERSION = "v1";

export function cifrarClave(clave: string, userId: string, llave: Buffer): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", llave, iv);
  cifrador.setAAD(Buffer.from(userId, "utf8"));
  const cifrado = Buffer.concat([cifrador.update(clave, "utf8"), cifrador.final()]);
  return [
    VERSION,
    iv.toString("base64"),
    cifrador.getAuthTag().toString("base64"),
    cifrado.toString("base64"),
  ].join(":");
}

/** Lanza si la copia fue alterada, es de otra cuenta o se cifró con otra llave. */
export function descifrarClave(copia: string, userId: string, llave: Buffer): string {
  const [version, iv, tag, cifrado] = copia.split(":");
  if (version !== VERSION || !iv || !tag || cifrado === undefined) {
    throw new Error("Formato de copia desconocido.");
  }
  const descifrador = createDecipheriv("aes-256-gcm", llave, Buffer.from(iv, "base64"));
  descifrador.setAAD(Buffer.from(userId, "utf8"));
  descifrador.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    descifrador.update(Buffer.from(cifrado, "base64")),
    descifrador.final(),
  ]).toString("utf8");
}

/** Copia cifrada con la llave configurada, o null si la bóveda está apagada. */
export function copiaCifrada(clave: string, userId: string): string | null {
  const llave = llaveBovedaClaves();
  return llave === null ? null : cifrarClave(clave, userId, llave);
}
