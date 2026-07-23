import { randomUUID, randomInt } from "node:crypto";

/** Identificador único expuesto (UUID v4). Usar en toda clave primaria expuesta. */
export function newId(): string {
  return randomUUID();
}

/**
 * Código numérico aleatorio de `length` dígitos (sufijos de username,
 * códigos de verificación). Criptográficamente seguro.
 */
export function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String(randomInt(0, 10));
  }
  return out;
}
