import { ValidationError } from "@/platform/errors";

/**
 * Regla de calificación (Fase 8).
 *
 * DECISIÓN PROVISIONAL (anotada en "Decisiones tomadas"): nota mínima de
 * aprobación 70/100, reintentos ilimitados — el negocio no ha definido estos
 * valores; cambiarlos es tocar SOLO este archivo.
 */
export const NOTA_MINIMA_APROBACION = 70;

export function validarScore(score: number): void {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new ValidationError("El puntaje debe ser un entero entre 0 y 100.");
  }
}

export function esAprobado(score: number): boolean {
  return score >= NOTA_MINIMA_APROBACION;
}
