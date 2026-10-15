/**
 * Dónde va el niño, leído del avance que deriva el servidor
 * (`GET /api/progression/children/[id]`). Lo comparten el encabezado de la
 * ficha y Academic Info, para que los dos digan lo mismo.
 */

export interface NivelAvance {
  levelId: string;
  codigo: string;
  nombre: string;
  orden: number;
  leccionesCompletadas: number;
  totalLecciones: number;
  levelUpAprobado: boolean;
  estado: "EN_CURSO" | "COMPLETADO" | "PENDIENTE";
  medalla: boolean;
  convalidado: boolean;
}

export interface Progreso {
  curso: { courseId: string; tipo: string; campania: string } | null;
  niveles: NivelAvance[];
  diploma: boolean;
  ubicacion: { levelId: string; lecciones: number; motivo: string; actualizada: string } | null;
}

export const CURSO_UI: Record<string, string> = {
  JUNIOR: "Junior (6–9)",
  YOUNGSTER: "Youngster (10–13)",
};

/**
 * El primer nivel sin completar y la lección que le sigue a las cursadas (la
 * misma regla del panel del niño). Sin niveles pendientes, egresó.
 */
export function ubicacionActual(progreso: Progreso | null): {
  nivelActual: NivelAvance | null;
  leccionActual: number | null;
  egresado: boolean;
} {
  const nivelActual = progreso?.niveles.find((n) => n.estado !== "COMPLETADO") ?? null;
  const leccionActual =
    nivelActual !== null
      ? Math.min(nivelActual.leccionesCompletadas + 1, nivelActual.totalLecciones)
      : null;
  const egresado = progreso !== null && progreso.niveles.length > 0 && nivelActual === null;
  return { nivelActual, leccionActual, egresado };
}
