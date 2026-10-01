import { unidadMapa } from "./unidad-mapa";

/**
 * IMPORTACIÓN DEL CATÁLOGO CURSO POR CSV: qué le pasa a cada fila.
 *
 * Es una decisión, no una consulta, y por eso vive aquí y se prueba sola: el
 * servidor la usa DOS veces —al VALIDAR, para que la pantalla diga qué va a
 * pasar antes de pedir la confirmación, y al CARGAR— y las dos tienen que dar
 * lo mismo. Si el previo se calculara aparte, sería una promesa que se
 * desincroniza de lo que después se escribe.
 *
 * Dos cosas que el CSV NO trae y que una actualización NO debe borrar:
 *
 *  - los CUESTIONARIOS (`quiz`): se arman en Gestión de Contenido. La primera
 *    versión del importador escribía `quiz = NULL` en cada lección que ya
 *    existía, así que recargar el temario se llevaba las evaluaciones;
 *  - las ZONAS de los juegos sobre la lámina (`x`/`y`/`w`/`h` dentro de cada
 *    actividad): las marca el editor de juegos. Se conservan en las
 *    actividades que siguen en el archivo con el mismo enlace.
 *
 * Y una columna que NO viene en el archivo tampoco se toca: un CSV con solo
 * el temario actualiza el temario y deja video y materiales como estaban.
 */

/** Lo que trae una fila del archivo. `undefined` = la columna no vino. */
export interface FilaCsvCurso {
  curso: string;
  nivel: string;
  unidad: string | null;
  leccion: string;
  orden?: number | undefined;
  contenido?: string | null | undefined;
  video?: string | null | undefined;
  materialGuia?: unknown[] | undefined;
  materialUsuario?: unknown[] | undefined;
  actividades?: unknown[] | undefined;
  recursos?: unknown[] | undefined;
  clubes?: unknown[] | undefined;
}

/** Lo que ya está guardado para esa lección. */
export interface LeccionGuardada {
  orden: number;
  contenido: string | null;
  video: string | null;
  quiz: unknown;
  materialGuia: unknown[];
  materialUsuario: unknown[];
  actividades: unknown[];
  recursos: unknown[];
  clubes: unknown[];
}

export type AccionImportacion = "CREAR" | "ACTUALIZAR" | "SIN_CAMBIOS";

export interface PlanFila {
  accion: AccionImportacion;
  /** Nombres legibles de lo que cambia (vacío al crear o sin cambios). */
  cambios: string[];
  /** Lo que conviene saber antes de confirmar; no impide cargar. */
  avisos: string[];
  /** La lección como quedará guardada. */
  resultado: LeccionGuardada;
}

const LISTAS = [
  ["materialGuia", "material del guía"],
  ["materialUsuario", "material del alumno"],
  ["actividades", "actividades"],
  ["recursos", "recursos"],
  ["clubes", "clubes"],
] as const;

type Item = Record<string, unknown>;

const esItem = (v: unknown): v is Item => typeof v === "object" && v !== null;
const enlaceDe = (it: Item): string => String(it["link"] ?? it["url"] ?? "").trim();
const tieneZona = (it: Item): boolean => typeof it["x"] === "number" && typeof it["y"] === "number";

/** Una lista reducida a lo que el CSV puede expresar: nombre y enlace. */
function firma(lista: unknown[]): string {
  return JSON.stringify(
    lista.filter(esItem).map((it) => [String(it["nombre"] ?? "").trim(), enlaceDe(it)]),
  );
}

/**
 * Lleva la zona de cada juego de la lista vieja a la nueva, por ENLACE: el
 * nombre se corrige a menudo ("Colores" → "Colors game") y el juego sigue
 * siendo el mismo; el enlace no. Devuelve también cuántas zonas se pierden
 * porque su juego ya no está en el archivo.
 */
export function conservarZonas(
  nuevas: unknown[],
  viejas: unknown[],
): { actividades: unknown[]; zonasPerdidas: number } {
  const zonaPorEnlace = new Map<string, Item>();
  for (const v of viejas) {
    if (esItem(v) && tieneZona(v) && enlaceDe(v) !== "") zonaPorEnlace.set(enlaceDe(v), v);
  }
  const usadas = new Set<string>();
  const actividades = nuevas.map((n) => {
    if (!esItem(n)) return n;
    const vieja = zonaPorEnlace.get(enlaceDe(n));
    if (vieja === undefined || usadas.has(enlaceDe(n))) return n;
    usadas.add(enlaceDe(n));
    const zona: Item = {};
    for (const k of ["x", "y", "w", "h"]) if (typeof vieja[k] === "number") zona[k] = vieja[k];
    return { ...n, ...zona };
  });
  return { actividades, zonasPerdidas: zonaPorEnlace.size - usadas.size };
}

const VACIA: LeccionGuardada = {
  orden: 0,
  contenido: null,
  video: null,
  quiz: null,
  materialGuia: [],
  materialUsuario: [],
  actividades: [],
  recursos: [],
  clubes: [],
};

export function planificarFila(fila: FilaCsvCurso, actual: LeccionGuardada | null): PlanFila {
  const base = actual ?? VACIA;
  const avisos: string[] = [];

  let actividades = fila.actividades ?? base.actividades;
  if (actual !== null && fila.actividades !== undefined) {
    const r = conservarZonas(fila.actividades, actual.actividades);
    actividades = r.actividades;
    if (r.zonasPerdidas > 0) {
      avisos.push(
        `${String(r.zonasPerdidas)} juego(s) ubicados en la lámina ya no están en el archivo: su zona se pierde.`,
      );
    }
  }

  const resultado: LeccionGuardada = {
    orden: fila.orden ?? base.orden,
    contenido: fila.contenido !== undefined ? fila.contenido : base.contenido,
    video: fila.video !== undefined ? fila.video : base.video,
    // El CSV no trae cuestionarios: nunca los pisa.
    quiz: base.quiz,
    materialGuia: fila.materialGuia ?? base.materialGuia,
    materialUsuario: fila.materialUsuario ?? base.materialUsuario,
    actividades,
    recursos: fila.recursos ?? base.recursos,
    clubes: fila.clubes ?? base.clubes,
  };

  if (unidadMapa(fila.unidad) === null && resultado.actividades.length > 0) {
    avisos.push(
      `"${fila.unidad ?? ""}" no es una parada del mapa: sus juegos no se abren desde la isla.`,
    );
  }

  if (actual === null) return { accion: "CREAR", cambios: [], avisos, resultado };

  const cambios: string[] = [];
  if (resultado.orden !== actual.orden) cambios.push("orden");
  if ((resultado.contenido ?? "") !== (actual.contenido ?? "")) cambios.push("contenido");
  if ((resultado.video ?? "") !== (actual.video ?? "")) cambios.push("video");
  for (const [campo, etiqueta] of LISTAS) {
    if (firma(resultado[campo]) !== firma(actual[campo])) cambios.push(etiqueta);
  }
  return {
    accion: cambios.length === 0 ? "SIN_CAMBIOS" : "ACTUALIZAR",
    cambios,
    avisos,
    resultado,
  };
}

/** Clave natural de una lección, la misma que usa el índice único de la tabla. */
export function claveLeccion(f: {
  curso: string;
  nivel: string;
  unidad: string | null;
  leccion: string;
}): string {
  return [f.curso, f.nivel, f.unidad ?? "", f.leccion.trim().toLowerCase()].join("|");
}
