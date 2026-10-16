/**
 * AGENDAR desde la ficha del niño (Academic management, 2026-10-16): reglas
 * puras. La lista de una clase sigue saliendo de las matrículas del salón;
 * agendar suma a un niño de OTRO salón a UNA sesión concreta.
 */

/** Lo que se agenda. "REGULAR" = una clase del horario de otro salón. */
export const TIPOS_AGENDA = ["SESION", "CLUB", "TALLER", "REGULAR", "WELCOME"] as const;
export type TipoAgenda = (typeof TIPOS_AGENDA)[number];

export const ETIQUETA_TIPO_AGENDA: Record<TipoAgenda, string> = {
  SESION: "Sesión extra",
  CLUB: "Club",
  TALLER: "Taller",
  REGULAR: "Clase regular",
  WELCOME: "Welcome",
};

export interface Tramo {
  /** Instantes en milisegundos. */
  inicio: number;
  fin: number;
}

/** Dos tramos se pisan si uno empieza antes de que el otro termine. Tocarse no es pisarse. */
export function seSolapan(a: Tramo, b: Tramo): boolean {
  return a.inicio < b.fin && a.fin > b.inicio;
}

export function tramo(startsAt: string | Date, duracionMin: number): Tramo {
  const inicio = new Date(startsAt).getTime();
  return { inicio, fin: inicio + duracionMin * 60_000 };
}

/** Lleno = sin cupo libre. Un límite 0 o negativo no limita. */
export function estaLleno(limite: number, ocupados: number): boolean {
  return limite > 0 && ocupados >= limite;
}

/** Cuántos lugares por encima del cupo quedaría al sumar uno. */
export function excesoAlAgendar(limite: number, ocupados: number): number {
  return limite > 0 ? Math.max(0, ocupados + 1 - limite) : 0;
}
