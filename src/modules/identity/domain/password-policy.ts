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
