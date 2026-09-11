/**
 * De la UNIDAD del catálogo a la casilla del mapa.
 *
 * En `catalog_curso` la unidad es texto libre y trae de todo: "Unidad 0",
 * "Unidad 1", "Repaso 2", "Evaluacion 1", con erratas incluidas ("Evalucion 6").
 * El mapa de la isla, en cambio, tiene exactamente CUATRO casillas.
 *
 * Solo "Unidad 1".."Unidad 4" caen en el mapa. "Unidad 0" es la bienvenida
 * —el cartel WELCOME de la isla, que no es una casilla—, y repasos y
 * evaluaciones no tienen casilla propia. Lo que no mapea no se pierde: sigue
 * en su lección, solo que no se abre desde el mapa.
 */

/** Casillas de unidad que marca el mapa de cada isla. */
export const UNIDADES_MAPA = 4;

/**
 * Número de casilla (1..4) de una unidad del catálogo, o null si no tiene.
 *
 * Tolera mayúsculas, espacios de más y acentos ("UNIDAD  2", "unidád 3"),
 * porque el texto entra por CSV escrito a mano.
 */
export function unidadMapa(texto: string | null | undefined): number | null {
  if (typeof texto !== "string") return null;
  const limpio = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  const m = /^UNIDAD\s+(\d+)$/.exec(limpio);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= UNIDADES_MAPA ? n : null;
}
