/**
 * EN QUÉ PUNTO VA UN SALÓN, expresado como UBICACIÓN de progresión.
 *
 * Dos medidas distintas de "lección" conviven y hay que traducir una a otra:
 * - el CALENDARIO dicta las lecciones del catálogo Curso (18 a 25 por nivel);
 * - la PROGRESIÓN cuenta las prácticas del nivel (4 por nivel).
 *
 * El salón va en la lección `pos` de `total` de su nivel; para alinear a un
 * niño que llega tarde se le dan por cursadas las prácticas que corresponden a
 * la parte del nivel que el salón ya dejó atrás (`pos - 1` lecciones). Es una
 * SUGERENCIA: coordinación la ve y la puede cambiar antes de confirmar.
 *
 * Sin ninguna clase dictada todavía, el salón está en el Welcome: primer
 * nivel, 0 lecciones.
 */
export function leccionesSugeridas(
  punto: { pos: number | null; total: number | null },
  practicasDelNivel: number,
): number {
  if (punto.pos === null || punto.total === null || punto.total <= 0) return 0;
  const cursadas = Math.max(punto.pos - 1, 0);
  return Math.min(Math.floor((cursadas / punto.total) * practicasDelNivel), practicasDelNivel);
}
