"use client";

/**
 * Abre el libro interactivo en SU PROPIA PESTAÑA y le guarda el progreso.
 *
 * El libro llega en una caja (CSP `sandbox` sin `allow-same-origin`), así que
 * su pestaña queda en un origen opaco: sin cookies, sin red y sin el
 * `localStorage` del sitio. El puente que el servidor le inyecta suple ese
 * almacén y manda cada cambio por `postMessage` a quien lo abrió; aquí se
 * recibe y se guarda en el `localStorage` del panel, con la clave del niño y
 * el nivel.
 *
 * Lo que ya tenía guardado viaja en el `name` de la pestaña, lo único que un
 * documento aislado lee de forma síncrona antes de que corra su script.
 */

/**
 * Cómo habla el puente, tal como lo manda el servidor (no se copia aquí). La
 * caja en sí (el `sandbox`) va en la CSP del libro: esta pestaña solo lo abre.
 */
export interface CajaLibro {
  prefijo: string;
  mensaje: string;
  /** Clave por la que el libro consulta qué unidades le abrió su guía. */
  claveAutorizaciones: string;
}

/**
 * Tope del progreso que se guarda: el almacenamiento del navegador ronda 5 MB
 * por sitio y lo comparte todo el panel.
 */
const TOPE_PROGRESO = 2_000_000;

/** Solo pares texto→texto: es lo único que un `localStorage` puede contener. */
function soloTextos(o: unknown): Record<string, string> {
  if (typeof o !== "object" || o === null) return {};
  return Object.fromEntries(
    Object.entries(o as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
}

function leerProgreso(clave: string): Record<string, string> {
  try {
    return soloTextos(JSON.parse(window.localStorage.getItem(clave) ?? "{}"));
  } catch {
    return {}; // sin almacenamiento (modo privado, cuota): el libro empieza de cero
  }
}

/**
 * El `name` con el que arranca el libro: `{v:2, datos, videos}` tras el prefijo.
 *
 * Los espacios van escapados como ` `. El nombre de una ventana no debe
 * llevar espacios en blanco, y el progreso SÍ los tiene (el diario del niño es
 * texto libre); escaparlos deja el JSON igual de válido al otro lado.
 */
export function nombreLibro(
  caja: CajaLibro,
  claveProgreso: string,
  videosBase: string | null,
  /** Lo que el guía le abrió, ya armado por el servidor. */
  autorizacion: string | null,
): string {
  const progreso = leerProgreso(claveProgreso);
  // La autorización manda SIEMPRE la del servidor: se pisa la que hubiera
  // quedado guardada de la vez anterior (el libro devuelve todo su almacén).
  if (autorizacion !== null) progreso[caja.claveAutorizaciones] = autorizacion;
  const datos = JSON.stringify({ v: 2, datos: progreso, videos: videosBase });
  return caja.prefijo + datos.replace(/ /g, "\\u0020");
}

/** Pestañas de libro abiertas desde aquí → dónde guardar SU progreso. */
const abiertas = new Map<MessageEventSource, string>();
let escuchando = false;

/**
 * Un solo oyente para todas las pestañas: se acepta lo que venga de una que
 * abrimos nosotros —el origen es "null" por la caja, así que se compara la
 * VENTANA, no el origen— y con forma de almacén.
 */
function escuchar(mensaje: string): void {
  if (escuchando) return;
  escuchando = true;
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source === null) return;
    const clave = abiertas.get(e.source);
    if (clave === undefined) return;
    const m = e.data as { tipo?: unknown; datos?: unknown } | null;
    if (m?.tipo !== mensaje) return;
    const texto = JSON.stringify(soloTextos(m.datos));
    if (texto.length > TOPE_PROGRESO) return;
    try {
      window.localStorage.setItem(clave, texto);
    } catch {
      // Sin almacenamiento: el libro sigue funcionando durante la sesión.
    }
  });
}

/**
 * Abre el libro en una pestaña nueva. Devuelve `false` si el navegador la
 * bloqueó, para que la pantalla lo diga en vez de no hacer nada.
 *
 * Volver a abrir el mismo libro reutiliza su pestaña (mismo `name`), así no se
 * acumulan copias del mismo libro con progresos distintos.
 */
export function abrirLibroEnPestana(opciones: {
  url: string;
  caja: CajaLibro;
  claveProgreso: string;
  videosBase: string | null;
  /** Unidades abiertas por el guía; null = no se entrega ninguna (vista previa). */
  autorizacion?: string | null;
}): boolean {
  const ventana = window.open(
    opciones.url,
    nombreLibro(
      opciones.caja,
      opciones.claveProgreso,
      opciones.videosBase,
      opciones.autorizacion ?? null,
    ),
  );
  if (ventana === null) return false;
  abiertas.set(ventana, opciones.claveProgreso);
  escuchar(opciones.caja.mensaje);
  ventana.focus();
  return true;
}
