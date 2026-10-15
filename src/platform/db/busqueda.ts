/**
 * Búsqueda de texto libre POR PALABRAS, la misma en todas las listas (Kids,
 * Contratos): cada palabra tiene que aparecer en alguna de las columnas, sin
 * tildes ni mayúsculas, y el documento se compara sin puntos ni guiones. Así
 * "elysa acevedo" y "acevedo elysa" encuentran a la misma niña.
 *
 * Es técnica (arma SQL parametrizado), no regla de negocio: qué columnas
 * entran lo decide cada repositorio.
 */

/** La columna en minúsculas y sin tildes, para comparar con lo que se escribe. */
export const SIN_TILDES = (col: string) =>
  `translate(lower(${col}), 'áéíóúàèìòùäëïöüâêîôûñ', 'aeiouaeiouaeiouaeioun')`;

/** El documento solo con letras y números, en mayúsculas. */
export const DOC_LIMPIO = (col: string) => `regexp_replace(upper(${col}), '[^A-Z0-9]', '', 'g')`;

/**
 * Las palabras de una búsqueda, en minúsculas y sin tildes, más su forma de
 * DOCUMENTO (solo letras y números, en mayúsculas). Hasta 5: más es ruido.
 */
export function palabrasDeBusqueda(texto: string): { texto: string; doc: string }[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p !== "")
    .slice(0, 5)
    .map((p) => ({ texto: p, doc: p.toUpperCase().replace(/[^A-Z0-9]/g, "") }));
}

/**
 * Agrega a `where`/`values` una condición por palabra. `columnas` son las de
 * texto (se comparan sin tildes y por "contiene"), `documentos` las de
 * documento (sin puntos ni guiones) y `exactas` las que deben coincidir
 * completas (el N° interno de contrato: "12" no debe traer el 120).
 */
export function condicionesPorPalabras(
  texto: string,
  cols: { columnas: string[]; documentos: string[]; exactas: string[] },
  where: string[],
  values: unknown[],
): void {
  for (const palabra of palabrasDeBusqueda(texto)) {
    values.push(`%${palabra.texto}%`);
    const t = String(values.length);
    values.push(palabra.texto);
    const exacto = String(values.length);
    values.push(palabra.doc === "" ? null : `%${palabra.doc}%`);
    const d = String(values.length);
    const partes = [
      ...cols.columnas.map((c) => `${SIN_TILDES(c)} LIKE $${t}`),
      ...cols.exactas.map((c) => `${c} = $${exacto}`),
      ...cols.documentos.map((c) => `($${d}::text IS NOT NULL AND ${DOC_LIMPIO(c)} LIKE $${d})`),
    ];
    where.push(`(${partes.join(" OR ")})`);
  }
}
