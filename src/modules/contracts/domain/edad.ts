import { TIPOS_CURSO, type CursoTipo } from "@/modules/catalog";
import { ValidationError } from "@/platform/errors";

/**
 * Validación de edad (sección 2.5): la edad del niño A LA FECHA DE INICIO
 * determina el tipo de curso. Se valida contra fecha de nacimiento — nunca
 * se confía en el dato tipeado en el contrato.
 * Junior 6–9 · Youngster 10–13 (rangos definidos en catalog).
 */

/** Edad cumplida en `fecha` (ambas YYYY-MM-DD, aritmética de calendario pura). */
export function edadEnFecha(fechaNacimiento: string, fecha: string): number {
  const [ny, nm, nd] = fechaNacimiento.split("-").map(Number);
  const [fy, fm, fd] = fecha.split("-").map(Number);
  let edad = (fy ?? 0) - (ny ?? 0);
  const cumpleDespues = (fm ?? 0) < (nm ?? 0) || ((fm ?? 0) === (nm ?? 0) && (fd ?? 0) < (nd ?? 0));
  if (cumpleDespues) edad -= 1;
  return edad;
}

export function validarEdadParaTipo(
  fechaNacimiento: string,
  inicioContrato: string,
  tipo: CursoTipo,
): void {
  const rango = TIPOS_CURSO.find((t) => t.tipo === tipo);
  if (rango === undefined) {
    throw new ValidationError(`Tipo de curso desconocido: ${tipo}.`);
  }
  const edad = edadEnFecha(fechaNacimiento, inicioContrato);
  if (edad < rango.edadMin || edad > rango.edadMax) {
    throw new ValidationError(
      `La edad del niño a la fecha de inicio (${edad} años) no corresponde a ` +
        `${rango.nombre} (${rango.edadMin}–${rango.edadMax} años).`,
      { details: { edad, tipo, rango: `${rango.edadMin}-${rango.edadMax}` } },
    );
  }
}
