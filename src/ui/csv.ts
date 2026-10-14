/**
 * Descarga de CSV para las consultas del panel: separador `;` y BOM, que es como
 * lo abre bien el Excel en español. El BOM se arma con `fromCharCode` porque las
 * herramientas de edición convierten el escape en el carácter invisible.
 */
const BOM = String.fromCharCode(0xfeff);

type Valor = string | number | boolean | null | undefined;

/** Una celda lista para el CSV. */
export function celdaCsv(v: Valor): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "boolean" ? (v ? "sí" : "no") : String(v);
  // Inyección de fórmulas: Excel EJECUTA una celda que empieza por = o @ (y por
  // + o - si no es un número). Un nombre escrito por una familia no debe poder
  // convertirse en fórmula al abrir el archivo.
  if (/^[=@]/.test(s) || /^[+-](?![\d\s])/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** El texto completo del CSV (con BOM). Separado de la descarga para probarlo. */
export function textoCsv(columnas: string[], filas: Valor[][]): string {
  return BOM + [columnas, ...filas].map((f) => f.map(celdaCsv).join(";")).join("\r\n");
}

/** Arma el archivo y lo descarga en el navegador. */
export function descargarCsv(nombre: string, columnas: string[], filas: Valor[][]): void {
  const blob = new Blob([textoCsv(columnas, filas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.endsWith(".csv") ? nombre : `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
