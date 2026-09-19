/**
 * Libro interactivo: un HTML autocontenido (imágenes y video en base64, un solo
 * <script>) que se sirve TAL CUAL lo entregó diseño, dentro de una caja.
 *
 * La caja es la clave. Ese HTML trae su propio JavaScript, y servido desde el
 * origen de la plataforma podría leer la sesión del niño y llamar a la API en
 * su nombre. Por eso se sirve con `sandbox` en la CSP y SIN `allow-same-origin`:
 * el documento queda en un origen opaco ("null"), sin cookies, sin
 * `localStorage` de la plataforma y sin red.
 *
 * El precio es que el libro pierde su `localStorage`, y ahí guarda el progreso
 * del niño (respuestas, diario, premios). El PUENTE lo devuelve: se inyecta al
 * principio del <head>, sustituye `localStorage` por un almacén en memoria y
 * manda cada cambio al panel que lo contiene, que lo guarda por niño. Al abrir,
 * el panel le devuelve lo guardado por `window.name`, que es lo único que un
 * documento aislado puede leer de forma síncrona antes de que corra su script.
 *
 * Probado en Chrome real: origen "null", `document.cookie` lanza
 * SecurityError, lectura y escritura pasan por el puente y `speechSynthesis`
 * (la voz de Emma) sigue disponible.
 */

/** Prefijo de `window.name` con el que el panel entrega el progreso guardado. */
export const PREFIJO_NOMBRE_LIBRO = "lgs-material:";

/** `tipo` del mensaje con el que el libro avisa al panel de un cambio. */
export const MENSAJE_ALMACEN_LIBRO = "lgs-material-almacen";

/**
 * Permisos de la caja. Cada uno responde a algo que el libro USA:
 * - scripts: el libro entero es JavaScript.
 * - forms: el examen es un <form>; sin esto el navegador ni siquiera dispara
 *   `submit`, y el libro lo intercepta con preventDefault.
 * - modals: `alert`/`confirm` ("¿Borrar mis respuestas?").
 * - downloads: "Exportar resultados" descarga un JSON.
 * - popups (+ escape): enlaces externos, p.ej. canciones en YouTube, que se
 *   abren en pestaña nueva como cualquier enlace.
 * NUNCA `allow-same-origin`: con él la caja deja de serlo.
 */
export const SANDBOX_LIBRO =
  "allow-scripts allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox";

/**
 * CSP del libro. Además de la caja: nada sale a la red (`connect-src 'none'`,
 * imágenes y medios solo `data:`/`blob:`) y solo la propia plataforma puede
 * enmarcarlo. `form-action 'none'` frena el envío real del examen, que el
 * libro ya cancela.
 */
export const CSP_LIBRO = [
  `sandbox ${SANDBOX_LIBRO}`,
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * El puente. Va en ES5 y sin dependencias: corre ANTES que el script del
 * libro, en cualquier navegador que el niño tenga.
 *
 * `sessionStorage` también se sustituye (en memoria, sin guardar): en un origen
 * opaco lanza igual que `localStorage`, y un libro futuro que lo use sin
 * try/catch se caería entero.
 */
export const PUENTE_ALMACEN = `(function(){
var P=${JSON.stringify(PREFIJO_NOMBRE_LIBRO)},T=${JSON.stringify(MENSAJE_ALMACEN_LIBRO)},d={};
try{var n=window.name;if(n&&n.indexOf(P)===0){var o=JSON.parse(n.slice(P.length));
if(o&&typeof o==="object"){for(var k in o){if(Object.prototype.hasOwnProperty.call(o,k)&&typeof o[k]==="string"){d[k]=o[k];}}}}}catch(e){}
function avisar(){try{window.name=P+JSON.stringify(d);}catch(e){}
try{if(window.parent&&window.parent!==window){window.parent.postMessage({tipo:T,datos:d},"*");}}catch(e){}}
function almacen(m,guardar){var s={
getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null;},
setItem:function(k,v){m[String(k)]=String(v);if(guardar)avisar();},
removeItem:function(k){delete m[String(k)];if(guardar)avisar();},
clear:function(){for(var k in m){if(Object.prototype.hasOwnProperty.call(m,k))delete m[k];}if(guardar)avisar();},
key:function(i){var ks=Object.keys(m);return i>=0&&i<ks.length?ks[i]:null;}};
Object.defineProperty(s,"length",{get:function(){return Object.keys(m).length;}});return s;}
try{Object.defineProperty(window,"localStorage",{value:almacen(d,true),configurable:true});}catch(e){}
try{Object.defineProperty(window,"sessionStorage",{value:almacen({},false),configurable:true});}catch(e){}
})();`;

/** Hasta dónde se busca el <head>: está al principio, no en los 30 MB de base64. */
const VENTANA_CABECERA = 64 * 1024;

/**
 * Devuelve el libro con el puente como PRIMER script del documento.
 *
 * Va justo después de `<head>`, antes que cualquier otro script. Si el
 * documento no trae <head>, después de `<html>`; si tampoco, después del
 * doctype — nunca delante de él, que mandaría el documento a modo quirks.
 *
 * Opera sobre bytes, sin convertir el archivo a texto: son 30 MB.
 */
export function inyectarPuente(html: Buffer): Buffer {
  const cabecera = html.subarray(0, VENTANA_CABECERA).toString("latin1").toLowerCase();
  const tras = (patron: RegExp): number | null => {
    const m = patron.exec(cabecera);
    return m === null ? null : m.index + m[0].length;
  };
  const corte =
    tras(/<head(\s[^>]*)?>/) ?? tras(/<html(\s[^>]*)?>/) ?? tras(/<!doctype[^>]*>/) ?? 0;
  const script = Buffer.from(`<script>${PUENTE_ALMACEN}</script>`, "utf8");
  return Buffer.concat([html.subarray(0, corte), script, html.subarray(corte)]);
}

/** Salta BOM y espacios iniciales: lo que importa es con qué EMPIEZA el contenido. */
function inicio(bytes: Buffer, largo: number): string {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09)
  ) {
    i++;
  }
  return bytes
    .subarray(i, i + largo)
    .toString("latin1")
    .toLowerCase();
}

/**
 * ¿Es un documento HTML? Se mira el CONTENIDO, no la extensión: un PDF
 * renombrado a .html no debe llegar al visor. Se saltan los comentarios
 * iniciales (`<!-- saved from url=… -->` al guardar desde un navegador).
 */
export function esHtml(bytes: Buffer): boolean {
  let s = inicio(bytes, 4096);
  while (s.startsWith("<!--")) {
    const fin = s.indexOf("-->");
    if (fin < 0) return false;
    s = s.slice(fin + 3).trimStart();
  }
  return s.startsWith("<!doctype html") || s.startsWith("<html");
}

/**
 * ¿Es un PDF? La firma `%PDF-` va al principio; el estándar tolera basura
 * delante siempre que la firma aparezca en el primer kilobyte.
 */
export function esPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 1024).includes("%PDF-");
}
