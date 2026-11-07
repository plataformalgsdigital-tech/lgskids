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
 *
 * Desde 2026-11-06, en el panel del NIÑO, además:
 * - el libro recibe lo que da la plataforma (`inyectar`: su identidad, sus
 *   entregas registradas y las revisiones del guía), que no puede escribir
 *   (`soloLectura`);
 * - lo que el libro guarda se manda al servidor (`sincronizar`), que registra
 *   los proyectos entregados; su respuesta —y una consulta periódica mientras
 *   el libro está abierto— le llega al libro sin recargarlo, así ve la revisión
 *   del guía apenas existe.
 */

/**
 * Cómo habla el puente, tal como lo manda el servidor (no se copia aquí). La
 * caja en sí (el `sandbox`) va en la CSP del libro: esta pestaña solo lo abre.
 */
export interface CajaLibro {
  prefijo: string;
  mensaje: string;
  /** Tipo del mensaje con el que el panel le entrega claves nuevas al libro. */
  mensajeActualizar?: string;
  /** Clave por la que el libro consulta qué unidades le abrió su guía. */
  claveAutorizaciones: string;
}

/** Lo que la plataforma le da al libro del niño (`datosLibroParaAlumno`). */
export interface DatosLibro {
  /** Se imponen al abrir: pisan lo que haya en el dispositivo. */
  inyectar: Record<string, string>;
  /** El avance guardado en el servidor, si el dispositivo no lo tiene. */
  restaurar: Record<string, string>;
  /** Las que el libro no puede escribir. */
  soloLectura: string[];
}

/**
 * Tope del progreso que se guarda: el almacenamiento del navegador ronda 5 MB
 * por sitio y lo comparte todo el panel.
 */
const TOPE_PROGRESO = 2_000_000;
/** Espera tras el último cambio antes de mandarlo al servidor (el niño escribe). */
const ESPERA_SINCRONIZAR_MS = 2_000;
/** Cada cuánto se pregunta por revisiones nuevas mientras el libro está abierto. */
const CONSULTA_PERIODICA_MS = 90_000;

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
 * Las voces del libro, tal como las arma el servidor (`vocesParaLibro`): qué
 * frases tienen audio y las intervenciones de los personajes. El panel solo
 * las pasa.
 */
export interface VocesLibro {
  disponibles: string[];
  intervenciones: { pagina: number; texto: string; nombre: string; imagen: string }[];
}

/** El progreso con el que arranca el libro: lo del dispositivo + lo del servidor. */
function progresoInicial(
  caja: CajaLibro,
  claveProgreso: string,
  autorizacion: string | null,
  libro: DatosLibro | null,
): Record<string, string> {
  const progreso = leerProgreso(claveProgreso);
  for (const [k, v] of Object.entries(libro?.restaurar ?? {})) {
    if (progreso[k] === undefined) progreso[k] = v;
  }
  Object.assign(progreso, libro?.inyectar ?? {});
  // La autorización manda SIEMPRE la del servidor: se pisa la que hubiera
  // quedado guardada de la vez anterior (el libro devuelve todo su almacén).
  if (autorizacion !== null) progreso[caja.claveAutorizaciones] = autorizacion;
  return progreso;
}

/**
 * El `name` con el que arranca el libro: `{v:2, datos, videos, voces, soloLectura}`
 * tras el prefijo.
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
  voces: VocesLibro | null = null,
  libro: DatosLibro | null = null,
): string {
  const progreso = progresoInicial(caja, claveProgreso, autorizacion, libro);
  const datos = JSON.stringify({
    v: 2,
    datos: progreso,
    videos: videosBase,
    voces,
    soloLectura: libro?.soloLectura ?? [],
  });
  return caja.prefijo + datos.replace(/ /g, "\\u0020");
}

/** Una pestaña de libro abierta desde aquí. */
interface Abierta {
  clave: string;
  caja: CajaLibro;
  /** Lo último que mandó el libro (o con lo que arrancó). */
  datos: Record<string, string>;
  /** Lo último que se le entregó, para no repetírselo. */
  entregado: string;
  sincronizar: ((datos: Record<string, string>) => Promise<Record<string, string> | null>) | null;
  espera: number | null;
  consulta: number | null;
}

/** Pestañas de libro abiertas desde aquí. */
const abiertas = new Map<Window, Abierta>();
let escuchando = false;

/** Manda al servidor lo del libro y le entrega al libro lo que cambió. */
async function sincronizarAhora(ventana: Window, a: Abierta): Promise<void> {
  if (a.sincronizar === null) return;
  if (ventana.closed) {
    soltar(ventana, a);
    return;
  }
  let nuevo: Record<string, string> | null;
  try {
    nuevo = await a.sincronizar(a.datos);
  } catch {
    return; // sin red: se reintenta con el próximo cambio o la próxima consulta
  }
  if (nuevo === null || a.caja.mensajeActualizar === undefined || ventana.closed) return;
  const texto = JSON.stringify(nuevo);
  if (texto === a.entregado) return;
  a.entregado = texto;
  ventana.postMessage({ tipo: a.caja.mensajeActualizar, datos: nuevo }, "*");
}

function soltar(ventana: Window, a: Abierta): void {
  if (a.espera !== null) window.clearTimeout(a.espera);
  if (a.consulta !== null) window.clearInterval(a.consulta);
  abiertas.delete(ventana);
}

/**
 * Un solo oyente para todas las pestañas: se acepta lo que venga de una que
 * abrimos nosotros —el origen es "null" por la caja, así que se compara la
 * VENTANA, no el origen— y con forma de almacén.
 */
function escuchar(): void {
  if (escuchando) return;
  escuchando = true;
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source === null) return;
    const ventana = e.source as Window;
    const a = abiertas.get(ventana);
    if (a === undefined) return;
    const m = e.data as { tipo?: unknown; datos?: unknown } | null;
    if (m?.tipo !== a.caja.mensaje) return;
    const datos = soloTextos(m.datos);
    const texto = JSON.stringify(datos);
    if (texto.length > TOPE_PROGRESO) return;
    a.datos = datos;
    try {
      window.localStorage.setItem(a.clave, texto);
    } catch {
      // Sin almacenamiento: el libro sigue funcionando durante la sesión.
    }
    if (a.sincronizar !== null) {
      if (a.espera !== null) window.clearTimeout(a.espera);
      a.espera = window.setTimeout(() => {
        a.espera = null;
        void sincronizarAhora(ventana, a);
      }, ESPERA_SINCRONIZAR_MS);
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
  /** Audios de ElevenLabs e intervenciones de los personajes. */
  voces?: VocesLibro | null;
  /** Identidad, entregas y revisiones (solo el panel del niño). */
  libro?: DatosLibro | null;
  /** Manda al servidor lo que guardó el libro y devuelve lo que debe tener ahora. */
  sincronizar?: (datos: Record<string, string>) => Promise<Record<string, string> | null>;
}): boolean {
  const autorizacion = opciones.autorizacion ?? null;
  const libro = opciones.libro ?? null;
  const ventana = window.open(
    opciones.url,
    nombreLibro(
      opciones.caja,
      opciones.claveProgreso,
      opciones.videosBase,
      autorizacion,
      opciones.voces ?? null,
      libro,
    ),
  );
  if (ventana === null) return false;
  const previa = abiertas.get(ventana);
  if (previa !== undefined) soltar(ventana, previa);
  const a: Abierta = {
    clave: opciones.claveProgreso,
    caja: opciones.caja,
    datos: progresoInicial(opciones.caja, opciones.claveProgreso, autorizacion, libro),
    entregado: JSON.stringify(libro?.inyectar ?? {}),
    sincronizar: opciones.sincronizar ?? null,
    espera: null,
    consulta: null,
  };
  if (a.sincronizar !== null) {
    a.consulta = window.setInterval(() => void sincronizarAhora(ventana, a), CONSULTA_PERIODICA_MS);
  }
  abiertas.set(ventana, a);
  escuchar();
  ventana.focus();
  return true;
}
