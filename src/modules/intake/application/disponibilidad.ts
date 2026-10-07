import { detalleCampania, listarCampanias } from "@/modules/catalog";
import { listarSalones, type ClassroomListItem } from "@/modules/scheduling";

export interface SalonDisponible {
  id: string;
  nombre: string;
  courseId: string;
  /** País/grupo del salón ("CL" grupo 01, "CO" grupo 02/resto) — lo usa LGS
   *  para mostrar solo los salones del país del contrato. Sale de holidayCountry. */
  pais: string;
  cupo: number;
  ocupados: number;
  cupoDisponible: number;
  /** true cuando ocupados >= cupo. Solo aparecen llenos con `incluirLlenos`. */
  lleno: boolean;
  /** Estado del salón. Solo aparecen inactivos con `incluirInactivos`. */
  activo: boolean;
  guia: string | null;
  horario: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
}
export interface CursoDisponible {
  tipo: string;
  /** Inicio y fin del PROGRAMA del curso (lo que el panel llama "Inicio/Final curso"). */
  inicio: string | null;
  finalCurso: string | null;
  salones: SalonDisponible[];
}
export interface CampaniaDisponible {
  id: string;
  nombre: string;
  /** Inicio comercial y fin de la campaña. */
  inicio: string;
  fin: string;
  /** Cierre de ventas (hasta cuándo está EN_MATRICULA). */
  finalVenta: string;
  cursos: CursoDisponible[];
}

/**
 * DISPONIBILIDAD para el intake de LGS: campañas EN_MATRICULA con sus cursos
 * (Junior/Youngster) y los salones ACTIVOS que AÚN tienen cupo (ocupados < cupo,
 * contando reservas). Compone catalog (campañas) + scheduling (salones).
 *
 * Los salones se asocian a la campaña por `courseId` (no por nombre de campaña).
 *
 * Opciones (consulta "Cursos Kids" de LGS, no el modal de inscripción):
 *  - `incluirLlenos`: también los salones sin cupo, marcados `lleno: true`.
 *  - `incluirInactivos`: también los salones inactivos, con `activo: false`
 *    (para mostrar la campaña igual que el panel de KIDS).
 */
export async function disponibilidad(
  opts: { incluirLlenos?: boolean; incluirInactivos?: boolean } = {},
): Promise<{ campanias: CampaniaDisponible[] }> {
  const abiertas = (await listarCampanias()).filter((c) => c.estado === "EN_MATRICULA");
  const [salones, detalles] = await Promise.all([
    listarSalones(),
    Promise.all(abiertas.map((c) => detalleCampania(c.id))),
  ]);

  const porCurso = new Map<string, ClassroomListItem[]>();
  for (const s of salones) {
    if (!s.activo && !opts.incluirInactivos) continue;
    if (!opts.incluirLlenos && s.ocupados >= s.cupo) continue;
    const arr = porCurso.get(s.courseId) ?? [];
    arr.push(s);
    porCurso.set(s.courseId, arr);
  }

  return {
    campanias: detalles.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      inicio: c.inicio,
      fin: c.fin,
      finalVenta: c.finalVenta,
      cursos: c.courses
        .map((curso) => ({
          tipo: curso.tipo,
          inicio: curso.inicio ?? null,
          finalCurso: curso.finalCurso ?? null,
          salones: (porCurso.get(curso.id) ?? []).map((s) => ({
            id: s.id,
            nombre: s.nombre,
            courseId: s.courseId,
            pais: s.holidayCountry,
            cupo: s.cupo,
            ocupados: s.ocupados,
            cupoDisponible: Math.max(0, s.cupo - s.ocupados),
            lleno: s.ocupados >= s.cupo,
            activo: s.activo,
            guia: s.guia,
            horario: s.horario,
          })),
        }))
        .filter((curso) => curso.salones.length > 0),
    })),
  };
}
