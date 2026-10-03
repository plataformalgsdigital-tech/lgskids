import { NotFoundError } from "@/platform/errors";
import { leccionesSugeridas } from "../domain/punto-salon";
import {
  getPosicionActual,
  listNivelesDeCursos,
  listSalonesCandidatos,
  type NivelDeCurso,
  type PosicionActual,
} from "../infrastructure/academico-repository";

/**
 * ACADEMIC CHANGE (ficha del niño › Academic Info): todo lo que el modal
 * necesita para decidir, en una sola respuesta.
 *
 * Las ESCRITURAS no viven aquí, y es a propósito: cada opción del modal llama
 * al camino que ya existe y ya cuida sus invariantes —
 *   - otro salón del mismo curso → `cambioAcademico` (enrollment);
 *   - promover / degradar        → `cambiarCursoContrato` (+ ubicación en el curso nuevo);
 *   - ajuste de nivel / lección  → `ubicarNino` (progression).
 * Un endpoint propio que hiciera las tres cosas sería un segundo camino de
 * matrícula y de avance, que es justo lo que las reglas 4 y 5 prohíben.
 */
export interface OpcionesAcademicas {
  actual: PosicionActual;
  salones: {
    id: string;
    nombre: string;
    tipo: string;
    courseId: string;
    campania: string;
    cupo: number;
    ocupados: number;
    guia: string | null;
    /** En qué punto va el salón, ya traducido a ubicación de progresión. */
    sugerencia: { levelId: string; nivel: string; lecciones: number } | null;
  }[];
  /** Niveles de cada curso que aparece arriba, por `courseId`. */
  niveles: Record<string, Omit<NivelDeCurso, "courseId">[]>;
}

export async function opcionesAcademicas(contractId: string): Promise<OpcionesAcademicas> {
  const actual = await getPosicionActual(contractId);
  if (actual === null) throw new NotFoundError("El contrato no existe.");
  const candidatos = await listSalonesCandidatos();
  const cursos = [...new Set([...candidatos.map((s) => s.courseId), actual.courseId ?? ""])].filter(
    (c) => c !== "",
  );
  const niveles = await listNivelesDeCursos(cursos);

  const porCurso: OpcionesAcademicas["niveles"] = {};
  for (const n of niveles) {
    (porCurso[n.courseId] ??= []).push({
      id: n.id,
      codigo: n.codigo,
      nombre: n.nombre,
      orden: n.orden,
      totalLecciones: n.totalLecciones,
    });
  }

  return {
    actual,
    niveles: porCurso,
    salones: candidatos.map((s) => {
      const delCurso = porCurso[s.courseId] ?? [];
      // Sin clases dictadas, el salón está en el Welcome: el primer nivel.
      const nivel =
        s.puntoNivel === null ? delCurso[0] : delCurso.find((n) => n.codigo === s.puntoNivel);
      return {
        id: s.id,
        nombre: s.nombre,
        tipo: s.tipo,
        courseId: s.courseId,
        campania: s.campania,
        cupo: s.cupo,
        ocupados: s.ocupados,
        guia: s.guia,
        sugerencia:
          nivel === undefined
            ? null
            : {
                levelId: nivel.id,
                nivel: nivel.nombre,
                lecciones: leccionesSugeridas(
                  { pos: s.puntoPos, total: s.puntoTotal },
                  nivel.totalLecciones,
                ),
              },
      };
    }),
  };
}
