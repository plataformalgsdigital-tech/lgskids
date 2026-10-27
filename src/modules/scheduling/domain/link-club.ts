/**
 * LINKS DE CLUBES (2026-10-28): salas de Zoom propias de los Clubs, distintas de
 * la del advisor. Cada una se usa un DÍA de la semana y en un horario; al crear
 * un Club se marca "Link diferente al del Advisor" y se elige entre las del día
 * de la fecha del Club.
 *
 * El día va como `Date.getDay()`: 0 = domingo … 6 = sábado.
 */

export const DIAS_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

/** El día de la semana (0 = domingo) de una fecha YYYY-MM-DD, sin zona horaria. */
export function diaDeFecha(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export interface DatosLinkClub {
  nombre: string;
  diaSemana: number;
  horario: string;
  link: string;
}

/** Qué le falta a un link de club para guardarse (null = nada). */
export function problemaLinkClub(d: DatosLinkClub): string | null {
  if (d.nombre.trim() === "") return "Escribe el nombre.";
  if (!Number.isInteger(d.diaSemana) || d.diaSemana < 0 || d.diaSemana > 6) {
    return "Elige el día de la semana.";
  }
  if (d.horario.trim() === "") return "Escribe el horario.";
  let url: URL;
  try {
    url = new URL(d.link.trim());
  } catch {
    return "El link no es una dirección web válida.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "El link tiene que empezar por https://.";
  }
  return null;
}

/**
 * ¿Sirve este link para un Club en esa fecha? Tiene que estar activo y ser del
 * MISMO día de la semana (una tanda repite el día, así que basta la primera).
 */
export function problemaLinkParaFecha(
  link: { activo: boolean; diaSemana: number; nombre: string },
  fecha: string,
): string | null {
  if (!link.activo) return `El link "${link.nombre}" está desactivado.`;
  const dia = diaDeFecha(fecha);
  if (link.diaSemana !== dia) {
    return `El link "${link.nombre}" es de los ${DIAS_SEMANA[link.diaSemana] ?? "?"} y el Club cae ${DIAS_SEMANA[dia] ?? "?"}.`;
  }
  return null;
}
