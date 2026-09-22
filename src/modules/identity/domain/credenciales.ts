import { randomInt } from "node:crypto";
import { randomDigits } from "@/platform/ids";

/**
 * Contraseña generada por la plataforma: sílabas + números (ej. "poketimu42"),
 * legible para dictarla por WhatsApp. 10 caracteres, cumple la política
 * (letras y números) y ~31 bits de azar (crypto `randomInt`).
 *
 * UNA sola receta para todo lo que la plataforma genera: alta de alumnos, de
 * staff y restablecimientos. Antes estaba copiada en dos archivos.
 */
export function generarPasswordInicial(): string {
  const consonantes = "bdfgklmnprstvz";
  const vocales = "aeiou";
  let palabra = "";
  for (let i = 0; i < 4; i += 1) {
    palabra += consonantes[randomInt(consonantes.length)];
    palabra += vocales[randomInt(vocales.length)];
  }
  return `${palabra}${randomDigits(2)}`;
}
