/**
 * La hora de un INSTANTE en Chile y en Colombia (Ecuador y Perú van con
 * Colombia: UTC-5 todo el año). El desfase entre los dos no es fijo —Chile
 * cambia la hora y Colombia no—, así que se calcula siempre desde el instante
 * con la base IANA, nunca sumando una cifra.
 */

export const ZONA_CHILE = "America/Santiago";
export const ZONA_COLOMBIA = "America/Bogota";

/** "17:00" del instante en esa zona. */
export function horaEnZona(instante: string, zona: string): string {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zona,
  }).format(new Date(instante));
}

/** La misma hora vista desde los dos grupos de países. */
export function referenciaHoraria(instante: string): { chile: string; colombia: string } {
  return {
    chile: horaEnZona(instante, ZONA_CHILE),
    colombia: horaEnZona(instante, ZONA_COLOMBIA),
  };
}
