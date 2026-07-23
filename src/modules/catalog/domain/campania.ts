import { ValidationError } from "@/platform/errors";

/**
 * Reglas puras de campaña.
 *
 * El ESTADO de una campaña nunca se almacena: se DERIVA por fecha
 * (sección 2.2 del diseño). Las fechas de campaña son DATE puros
 * (YYYY-MM-DD); la fecha "hoy" la aporta quien llama, calculada en la zona
 * operativa (ADR-0007) — este módulo no lee relojes.
 */

export type EstadoCampania = "EN_MATRICULA" | "ACTIVA" | "CERRADA";

/** Compara fechas DATE en formato ISO (YYYY-MM-DD): orden lexicográfico. */
export function derivarEstadoCampania(inicio: string, fin: string, hoy: string): EstadoCampania {
  if (hoy < inicio) return "EN_MATRICULA";
  if (hoy > fin) return "CERRADA";
  return "ACTIVA";
}

export const ETIQUETA_ESTADO: Record<EstadoCampania, string> = {
  EN_MATRICULA: "En matrícula",
  ACTIVA: "Activa",
  CERRADA: "Cerrada",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DURACION_MIN_SEMANAS = 1;
export const DURACION_MAX_SEMANAS = 52;

/**
 * Valida los datos de una campaña nueva y calcula su fecha fin nominal:
 * inicio + (semanas * 7 - 1) días. Ese fin será también el `final_curso`
 * NOMINAL de los cursos generados — que nunca se reescribe.
 */
export function planificarCampania(input: {
  nombre: string;
  inicio: string;
  duracionSemanas: number;
}): { nombre: string; inicio: string; fin: string } {
  const nombre = input.nombre.trim();
  if (nombre.length < 3 || nombre.length > 80) {
    throw new ValidationError("El nombre debe tener entre 3 y 80 caracteres.");
  }
  if (!ISO_DATE.test(input.inicio)) {
    throw new ValidationError("La fecha de inicio debe ser YYYY-MM-DD.");
  }
  if (
    !Number.isInteger(input.duracionSemanas) ||
    input.duracionSemanas < DURACION_MIN_SEMANAS ||
    input.duracionSemanas > DURACION_MAX_SEMANAS
  ) {
    throw new ValidationError(
      `La duración debe ser un número entero de semanas entre ${DURACION_MIN_SEMANAS} y ${DURACION_MAX_SEMANAS}.`,
    );
  }
  // Aritmética de DATE puro en UTC: sin zonas ni horas involucradas.
  const [y, m, d] = input.inicio.split("-").map(Number);
  const inicioUtc = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  const finUtc = inicioUtc + (input.duracionSemanas * 7 - 1) * 24 * 60 * 60 * 1000;
  const fin = new Date(finUtc).toISOString().slice(0, 10);
  return { nombre, inicio: input.inicio, fin };
}
