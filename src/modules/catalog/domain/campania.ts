import { ValidationError } from "@/platform/errors";

/**
 * Reglas puras de campaña.
 *
 * El ESTADO de una campaña nunca se almacena: se DERIVA por fecha.
 * - EN_MATRÍCULA: hasta el cierre de matrícula (final de venta = inicio del
 *   curso + 3 semanas). Visible en el wizard de contratos.
 * - ACTIVA: pasado el cierre de matrícula y hasta el fin de la campaña (los 12
 *   meses). Ya NO visible en el wizard de contratos.
 * - INACTIVA: pasado el fin de la campaña.
 *
 * Las fechas de campaña son DATE puros (YYYY-MM-DD); la fecha "hoy" la aporta
 * quien llama, calculada en la zona operativa (ADR-0007) — no lee relojes.
 */

export type EstadoCampania = "EN_MATRICULA" | "ACTIVA" | "CERRADA";

/** Compara fechas DATE en formato ISO (YYYY-MM-DD): orden lexicográfico. */
export function derivarEstadoCampania(
  finalVenta: string,
  fin: string,
  hoy: string,
): EstadoCampania {
  if (hoy <= finalVenta) return "EN_MATRICULA";
  if (hoy > fin) return "CERRADA";
  return "ACTIVA";
}

export const ETIQUETA_ESTADO: Record<EstadoCampania, string> = {
  EN_MATRICULA: "En matrícula",
  ACTIVA: "Activa",
  CERRADA: "Inactiva",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Vigencia de una campaña: 12 meses desde el inicio (el fin es editable). */
export const MESES_VIGENCIA = 12;
/** Cierre de matrícula: 3 semanas después del inicio del curso. */
export const SEMANAS_VENTA = 3;

/** Suma meses calendario a una fecha DATE (YYYY-MM-DD), en UTC puro. */
export function sumarMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  dt.setUTCMonth(dt.getUTCMonth() + meses);
  return dt.toISOString().slice(0, 10);
}

/** Suma días a una fecha DATE (YYYY-MM-DD), en UTC puro. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const utc = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) + dias * 24 * 60 * 60 * 1000;
  return new Date(utc).toISOString().slice(0, 10);
}

export interface PlanCampania {
  nombre: string;
  inicio: string; // inicio de la campaña (comercial)
  fin: string; // inicio + 12 meses (o el editado)
  cursoInicio: string; // inicio del curso (arranque de clases)
  finalVenta: string; // cierre de matrícula = cursoInicio + 3 semanas
}

/**
 * Valida los datos de una campaña nueva y calcula sus fechas derivadas:
 * - `fin` por defecto = inicio + 12 meses (editable: si viene `fin`, se usa).
 * - `finalVenta` (cierre de matrícula) = inicio del curso + 3 semanas.
 * El `fin` será también el `final_curso` NOMINAL de los cursos — que nunca se
 * reescribe (regla dura 1): las sesiones corren del inicio del curso al fin.
 */
export function planificarCampania(input: {
  nombre: string;
  inicio: string;
  cursoInicio: string;
  fin?: string | undefined;
}): PlanCampania {
  const nombre = input.nombre.trim();
  if (nombre.length < 3 || nombre.length > 80) {
    throw new ValidationError("El nombre debe tener entre 3 y 80 caracteres.");
  }
  if (!ISO_DATE.test(input.inicio)) {
    throw new ValidationError("La fecha de inicio de campaña debe ser YYYY-MM-DD.");
  }
  if (!ISO_DATE.test(input.cursoInicio)) {
    throw new ValidationError("La fecha de inicio del curso debe ser YYYY-MM-DD.");
  }
  if (input.cursoInicio < input.inicio) {
    throw new ValidationError("El inicio del curso no puede ser anterior al inicio de la campaña.");
  }

  const fin = input.fin ?? sumarMeses(input.inicio, MESES_VIGENCIA);
  if (!ISO_DATE.test(fin)) {
    throw new ValidationError("La fecha fin de campaña debe ser YYYY-MM-DD.");
  }
  if (fin <= input.cursoInicio) {
    throw new ValidationError("El fin de la campaña debe ser posterior al inicio del curso.");
  }

  const finalVenta = sumarDias(input.cursoInicio, SEMANAS_VENTA * 7);
  return { nombre, inicio: input.inicio, fin, cursoInicio: input.cursoInicio, finalVenta };
}
