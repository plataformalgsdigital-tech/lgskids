/**
 * Aritmética de DATE puro (YYYY-MM-DD) sin zonas horarias.
 * Todo cálculo de calendario del scheduling pasa por aquí.
 */

export function aFecha(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + dias)).toISOString().slice(0, 10);
}

/** 0=domingo … 6=sábado. */
export function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** Primera ocurrencia del día de semana `dow` en o después de `fecha`. */
export function primeraOcurrencia(fecha: string, dow: number): string {
  const delta = (dow - diaSemana(fecha) + 7) % 7;
  return sumarDias(fecha, delta);
}

/** Cantidad de ocurrencias del día `dow` dentro de [inicio, fin] inclusive. */
export function contarOcurrencias(inicio: string, fin: string, dow: number): number {
  const primera = primeraOcurrencia(inicio, dow);
  if (primera > fin) return 0;
  const [py, pm, pd] = primera.split("-").map(Number);
  const [fy, fm, fd] = fin.split("-").map(Number);
  const dias =
    (Date.UTC(fy ?? 0, (fm ?? 1) - 1, fd ?? 1) - Date.UTC(py ?? 0, (pm ?? 1) - 1, pd ?? 1)) /
    86_400_000;
  return Math.floor(dias / 7) + 1;
}
