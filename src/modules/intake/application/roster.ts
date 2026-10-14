import { detalleCampania, listarCampanias } from "@/modules/catalog";
import { listarMatriculasIntake, type MatriculaIntakeItem } from "@/modules/enrollment";
import { listarSalones } from "@/modules/scheduling";

export interface SalonRoster {
  id: string;
  nombre: string;
  pais: string;
  activo: boolean;
  cupo: number;
  /** Ocupación (ACTIVA + RESERVADA), la misma que usa el control de cupos. */
  ocupados: number;
  guia: string | null;
  horario: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
  /** Matrículas del salón en CUALQUIER estado (ACTIVA/RESERVADA/FINALIZADA/CANCELADA). */
  matriculas: MatriculaIntakeItem[];
}
export interface CursoRoster {
  tipo: string;
  inicio: string | null;
  finalCurso: string | null;
  salones: SalonRoster[];
}
export interface CampaniaRoster {
  id: string;
  nombre: string;
  /** EN_MATRICULA / ACTIVA / CERRADA (derivado de las fechas). */
  estado: string;
  inicio: string;
  fin: string;
  finalVenta: string;
  cursos: CursoRoster[];
}

/**
 * ROSTER para la consulta "Kids" de LGS: TODAS las campañas (cualquier estado)
 * con sus cursos, todos los salones (activos o no, llenos o no) y las matrículas
 * de cada salón con contrato, niño y apoderado. Solo lectura.
 */
export async function roster(): Promise<{ campanias: CampaniaRoster[] }> {
  const campanias = await listarCampanias();
  const [salones, detalles, matriculas] = await Promise.all([
    listarSalones(),
    Promise.all(campanias.map((c) => detalleCampania(c.id))),
    listarMatriculasIntake(),
  ]);

  const porSalon = new Map<string, MatriculaIntakeItem[]>();
  for (const m of matriculas) {
    const arr = porSalon.get(m.classroomId) ?? [];
    arr.push(m);
    porSalon.set(m.classroomId, arr);
  }

  const estadoPorId = new Map(campanias.map((c) => [c.id, c.estado as string]));

  return {
    campanias: detalles.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      estado: estadoPorId.get(c.id) ?? "",
      inicio: c.inicio,
      fin: c.fin,
      finalVenta: c.finalVenta,
      cursos: c.courses.map((curso) => ({
        tipo: curso.tipo,
        inicio: curso.inicio ?? null,
        finalCurso: curso.finalCurso ?? null,
        salones: salones
          .filter((s) => s.courseId === curso.id)
          .map((s) => ({
            id: s.id,
            nombre: s.nombre,
            pais: s.holidayCountry,
            activo: s.activo,
            cupo: s.cupo,
            ocupados: s.ocupados,
            guia: s.guia,
            horario: s.horario,
            matriculas: porSalon.get(s.id) ?? [],
          })),
      })),
    })),
  };
}
