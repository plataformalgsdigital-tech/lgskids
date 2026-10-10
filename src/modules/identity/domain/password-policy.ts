import { ValidationError } from "@/platform/errors";

/**
 * Política de contraseñas de la plataforma.
 *
 * Aplica a todos los usuarios (admin, guías, apoderados). Las cuentas de
 * niños reciben contraseña inicial generada; al cambiarla rige esta política.
 */
export const PASSWORD_MIN_LENGTH = 10;

export function validarPassword(password: string): void {
  const problemas: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problemas.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (!/[a-zA-Z]/.test(password)) {
    problemas.push("Debe incluir al menos una letra.");
  }
  if (!/[0-9]/.test(password)) {
    problemas.push("Debe incluir al menos un número.");
  }
  if (problemas.length > 0) {
    throw new ValidationError("La contraseña no cumple la política.", {
      details: problemas,
    });
  }
}

/**
 * La clave que el NIÑO elige al crear su perfil (2026-10-10, decisión del
 * negocio): al menos 8 caracteres, con letras y números. Más corta que la de
 * la plataforma porque la escribe un niño de 6 a 13 años.
 */
export const CLAVE_NINO_MIN = 8;

/** El primer problema de la clave del niño, o null si sirve. */
export function problemaClaveNino(clave: string): string | null {
  if (clave.length < CLAVE_NINO_MIN) {
    return `La clave debe tener al menos ${String(CLAVE_NINO_MIN)} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(clave)) return "La clave debe tener al menos una letra.";
  if (!/[0-9]/.test(clave)) return "La clave debe tener al menos un número.";
  if (clave.length > 72) return "La clave es demasiado larga.";
  return null;
}
