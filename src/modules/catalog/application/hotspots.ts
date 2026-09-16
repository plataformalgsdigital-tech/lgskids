import { ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";
import {
  getHotspotData,
  listHotspotsCurso,
  upsertHotspot,
} from "../infrastructure/hotspot-repository";

/**
 * Hotspots del arte curricular (pantalla "Avance"). Coordenadas en % (0..100)
 * sobre una imagen:
 *  - scope ISLA → sobre el banner del nivel: `welcome` + `unidades[]` + `premio`.
 *  - scope MAPA → sobre el mapa del curso: `unidades[]` + `centro` (de esa isla).
 *
 * El **Welcome va en su propio campo**, NO al principio de `unidades[]`. Ese
 * arreglo es POSICIONAL —`unidades[0]` es la Unidad 1— y los hotspots de Junior
 * ya están marcados: meter el Welcome dentro correría todos los marcadores una
 * posición, en silencio y sobre datos buenos.
 */

export type Punto = { x: number; y: number };
export type HotspotScope = "ISLA" | "MAPA";
export interface HotspotData {
  /** Parada 0 de la isla. Puede faltar: el arte viejo no la tenía. */
  welcome: Punto | null;
  /** Posicional: `unidades[0]` es la Unidad 1. */
  unidades: Punto[];
  premio: Punto | null;
  centro: Punto | null;
}

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const NIVELES_CODIGO = NIVELES.map((n) => n.codigo) as readonly string[];
const SCOPES: readonly HotspotScope[] = ["ISLA", "MAPA"];

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function normPunto(p: unknown): Punto | null {
  if (p === null || typeof p !== "object") return null;
  const o = p as { x?: unknown; y?: unknown };
  if (typeof o.x !== "number" || typeof o.y !== "number") return null;
  return { x: clampPct(o.x), y: clampPct(o.y) };
}

function normData(raw: unknown): HotspotData {
  const o = (raw ?? {}) as {
    welcome?: unknown;
    unidades?: unknown;
    premio?: unknown;
    centro?: unknown;
  };
  const unidades = Array.isArray(o.unidades)
    ? o.unidades
        .map(normPunto)
        .filter((x): x is Punto => x !== null)
        .slice(0, 8)
    : [];
  return {
    welcome: normPunto(o.welcome),
    unidades,
    premio: normPunto(o.premio),
    centro: normPunto(o.centro),
  };
}

function validar(scope: string, curso: string, nivel: string): void {
  if (!(SCOPES as readonly string[]).includes(scope))
    throw new ValidationError(`Scope inválido: ${scope}.`);
  if (!CURSOS.includes(curso)) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (!NIVELES_CODIGO.includes(nivel)) throw new ValidationError(`Nivel inválido: ${nivel}.`);
}

export async function getHotspots(
  scope: string,
  curso: string,
  nivel: string,
): Promise<HotspotData> {
  validar(scope, curso, nivel);
  return normData(await getHotspotData(scope, curso, nivel));
}

export async function setHotspots(input: {
  actorUserId: string;
  scope: string;
  curso: string;
  nivel: string;
  data: unknown;
}): Promise<HotspotData> {
  validar(input.scope, input.curso, input.nivel);
  const data = normData(input.data);
  await upsertHotspot(newId(), input.scope, input.curso, input.nivel, JSON.stringify(data));
  return data;
}

/** Todos los hotspots de un curso, para el panel del alumno (pantalla Avance). */
export async function getHotspotsCurso(
  curso: string,
): Promise<{ isla: Record<string, HotspotData>; mapa: Record<string, HotspotData> }> {
  const isla: Record<string, HotspotData> = {};
  const mapa: Record<string, HotspotData> = {};
  if (!CURSOS.includes(curso)) return { isla, mapa };
  const rows = await listHotspotsCurso(curso);
  for (const r of rows) {
    if (r.scope === "MAPA") mapa[r.nivel] = normData(r.data);
    else isla[r.nivel] = normData(r.data);
  }
  return { isla, mapa };
}
