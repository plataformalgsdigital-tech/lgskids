/**
 * Libro interactivo: un HTML autocontenido que se sirve TAL CUAL lo entregó
 * diseño, dentro de una caja. Las imágenes van dentro en base64; los videos, ya
 * no: el libro los pide por ruta relativa (`videos/7-1.mp4`, ver
 * `video-libro.ts`).
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
 * manda cada cambio al panel, que lo guarda por niño. Al abrir, el panel le
 * devuelve lo guardado por `window.name`, que es lo único que un documento
 * aislado puede leer de forma síncrona antes de que corra su script.
 *
 * El libro se abre en su PROPIA PESTAÑA (2026-09-22), así que el panel puede
 * ser la ventana que lo contiene (iframe) o la que lo abrió (`opener`): el
 * puente le habla a la que haya. Además guarda cada cambio en su `window.name`,
 * que sobrevive a recargar esa pestaña aunque el panel ya no esté.
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
 * CONTRATO CON DISEÑO (2026-09-23) — qué unidades abrió el guía.
 *
 * El libro lee esta clave de su almacenamiento (el que le sustituye el puente)
 * antes de decidir qué unidad se puede abrir:
 *
 *   lgs-autorizaciones = {"v":1,"unidades":[0,1]}
 *
 * Los números son los MISMOS del mapa y del libro (0 = Welcome/Puerto, 1..4).
 * La lista es acumulativa: llegan todas las que el niño tiene abiertas.
 *
 * Si la clave NO está, el libro se comporta como siempre (abre por su cuenta).
 * Así el mismo archivo sigue funcionando suelto, fuera de la plataforma.
 */
export const CLAVE_AUTORIZACIONES_LIBRO = "lgs-autorizaciones";

/** Valor de esa clave, armado en UN solo lugar. */
export function valorAutorizacionesLibro(paradas: readonly number[]): string {
  return JSON.stringify({ v: 1, unidades: [...paradas].sort((a, b) => a - b) });
}

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
 * imágenes solo `data:`/`blob:`) y solo la propia plataforma puede enmarcarlo.
 * `form-action 'none'` frena el envío real del examen, que el libro ya cancela.
 *
 * `baseVideos` (`https://…/api/material/<id>/`) es la ÚNICA puerta abierta: los
 * videos del libro y la `<base>` que pone el puente pueden apuntar ahí y a
 * ningún otro lado. Termina en `/`, así que la CSP lo trata como prefijo de
 * ruta: sirve para los videos de ESTE libro, no para el resto de la API.
 */
export function cspLibro(baseVideos: string | null): string {
  return [
    `sandbox ${SANDBOX_LIBRO}`,
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    baseVideos === null ? "media-src data: blob:" : `media-src data: blob: ${baseVideos}`,
    "font-src data:",
    "connect-src 'none'",
    "frame-ancestors 'self'",
    `base-uri ${baseVideos ?? "'none'"}`,
    "form-action 'none'",
  ].join("; ");
}

/**
 * El puente. Va en ES5 y sin dependencias: corre ANTES que el script del
 * libro, en cualquier navegador que el niño tenga.
 *
 * Lee lo que el panel le deja en `window.name`, `{v:2, datos, videos}`:
 * - `datos`: el progreso guardado; sustituye `localStorage` y devuelve cada
 *   cambio al panel.
 * - `videos`: la base con token (`/api/material/<id>/t/<token>/`). Se pone como
 *   `<base>` del documento, así la ruta relativa `videos/7-1.mp4` que escribe
 *   diseño llega autorizada: desde la caja el navegador NO manda la cookie de
 *   sesión. Solo se aceptan rutas del propio sitio (`/…`, nunca `//otro`), y la
 *   CSP (`base-uri`) lo vuelve a exigir.
 * Un `window.name` antiguo (solo el progreso, sin `v`) se sigue entendiendo.
 *
 * `sessionStorage` también se sustituye (en memoria, sin guardar): en un origen
 * opaco lanza igual que `localStorage`, y un libro futuro que lo use sin
 * try/catch se caería entero.
 */
export const PUENTE_ALMACEN = `(function(){
var P=${JSON.stringify(PREFIJO_NOMBRE_LIBRO)},T=${JSON.stringify(MENSAJE_ALMACEN_LIBRO)},d={},base=null;
function propio(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
function textos(o){var r={};if(o&&typeof o==="object"){for(var k in o){if(propio(o,k)&&typeof o[k]==="string"){r[k]=o[k];}}}return r;}
try{var n=window.name;if(n&&n.indexOf(P)===0){var o=JSON.parse(n.slice(P.length));
if(o&&o.v===2){d=textos(o.datos);var b=o.videos;if(typeof b==="string"&&b.charAt(0)==="/"&&b.charAt(1)!=="/"){base=b;}}
else{d=textos(o);}}}catch(e){}
if(base){try{var e=document.createElement("base");e.href=base;var h=document.head||document.documentElement;h.insertBefore(e,h.firstChild);}catch(x){}}
function panel(){try{if(window.parent&&window.parent!==window)return window.parent;}catch(e){}
try{if(window.opener)return window.opener;}catch(e){}return null;}
function avisar(){try{window.name=P+JSON.stringify({v:2,datos:d,videos:base});}catch(e){}
try{var w=panel();if(w)w.postMessage({tipo:T,datos:d},"*");}catch(e){}}
function almacen(m,guardar){var s={
getItem:function(k){k=String(k);return propio(m,k)?m[k]:null;},
setItem:function(k,v){m[String(k)]=String(v);if(guardar)avisar();},
removeItem:function(k){delete m[String(k)];if(guardar)avisar();},
clear:function(){for(var k in m){if(propio(m,k))delete m[k];}if(guardar)avisar();},
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
