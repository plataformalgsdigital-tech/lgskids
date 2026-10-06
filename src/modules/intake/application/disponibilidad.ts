import { listarCampanias } from "@/modules/catalog";
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
  guia: string | null;
  horario: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
}
export interface CursoDisponible {
  tipo: string;
  salones: SalonDisponible[];
}
export interface CampaniaDisponible {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  cursos: CursoDisponible[];
}

/**
 * DISPONIBILIDAD para el intake de LGS: campañas EN_MATRICULA con sus cursos
 * (Junior/Youngster) y los salones que AÚN tienen cupo (ocupados < cupo,
 * contando reservas). Compone catalog (campañas) + scheduling (salones).
 *
 * `incluirLlenos` (consulta "Cursos Kids" de LGS): devuelve también los salones
 * activos SIN cupo, marcados `lleno: true`. El modal de inscripción NO lo pide,
 * así que para inscribir solo ve salones con cupo.
 */
export async function disponibilidad(
  opts: { incluirLlenos?: boolean } = {},
): Promise<{ campanias: CampaniaDisponible[] }> {
  const abiertas = (await listarCampanias()).filter((c) => c.estado === "EN_MATRICULA");
  const salones = await listarSalones();

  const porCampania = new Map<string, ClassroomListItem[]>();
  for (const s of salones) {
    if (!s.activo) continue;
    if (!opts.incluirLlenos && s.ocupados >= s.cupo) continue;
    const arr = porCampania.get(s.campania) ?? [];
    arr.push(s);
    porCampania.set(s.campania, arr);
  }

  return {
    campanias: abiertas.map((c) => {
      const salonesCampania = porCampania.get(c.nombre) ?? [];
      const porTipo = new Map<string, SalonDisponible[]>();
      for (const s of salonesCampania) {
        const arr = porTipo.get(s.curso) ?? [];
        arr.push({
          id: s.id,
          nombre: s.nombre,
          courseId: s.courseId,
          pais: s.holidayCountry,
          cupo: s.cupo,
          ocupados: s.ocupados,
          cupoDisponible: Math.max(0, s.cupo - s.ocupados),
          lleno: s.ocupados >= s.cupo,
          guia: s.guia,
          horario: s.horario,
        });
        porTipo.set(s.curso, arr);
      }
      return {
        id: c.id,
        nombre: c.nombre,
        inicio: c.inicio,
        fin: c.fin,
        cursos: [...porTipo.entries()].map(([tipo, salones]) => ({ tipo, salones })),
      };
    }),
  };
}
