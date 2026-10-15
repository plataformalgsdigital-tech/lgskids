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

/**
 * Lee un CSV SUBIDO. El Excel en español guarda "CSV (delimitado por comas)" en
 * ANSI (Windows-1252), no en UTF-8: leído como UTF-8, cada tilde llega como "�"
 * y así entraron "Evaluaci�n" y "don�t" al catálogo (2026-10-14). Se intenta
 * UTF-8 ESTRICTO y, si el archivo no lo es, se lee como Windows-1252 — que
 * es lo que es en la práctica. `ansi` avisa a la pantalla para decirlo.
 */
export function decodificarCsv(bytes: ArrayBuffer | Uint8Array): { texto: string; ansi: boolean } {
  try {
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes), ansi: false };
  } catch {
    // A mano y no con `TextDecoder("windows-1252")`: Node lo trata como
    // Latin-1 y pierde justo los signos de 0x80–0x9F (’ “ ” – …), que el Excel
    // pone al autocorregir. Fuera de ese tramo, Windows-1252 = Latin-1.
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let texto = "";
    for (const b of u8) {
      texto += String.fromCharCode(b >= 0x80 && b <= 0x9f ? (CP1252_80_9F[b - 0x80] ?? b) : b);
    }
    return { texto, ansi: true };
  }
}

/** Windows-1252, bytes 0x80–0x9F (los cinco sin asignar se dejan como vienen). */
const CP1252_80_9F = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

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
