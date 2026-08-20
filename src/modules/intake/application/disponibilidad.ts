import { listarCampanias } from "@/modules/catalog";
import { listarSalones, type ClassroomListItem } from "@/modules/scheduling";

export interface SalonDisponible {
  id: string;
  nombre: string;
  courseId: string;
  cupo: number;
  ocupados: number;
  cupoDisponible: number;
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
 */
export async function disponibilidad(): Promise<{ campanias: CampaniaDisponible[] }> {
  const abiertas = (await listarCampanias()).filter((c) => c.estado === "EN_MATRICULA");
  const salones = await listarSalones();

  const porCampania = new Map<string, ClassroomListItem[]>();
  for (const s of salones) {
    if (!s.activo || s.ocupados >= s.cupo) continue;
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
          cupo: s.cupo,
          ocupados: s.ocupados,
          cupoDisponible: s.cupo - s.ocupados,
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
