/** PUERTOS y tipos del módulo catalog. Fechas DATE siempre como YYYY-MM-DD. */

import type { EstadoCampania } from "../domain/campania";
import type { CursoTipo, NivelCodigo } from "../domain/curriculo";

export interface CampaignGraph {
  campaign: { id: string; nombre: string; inicio: string; fin: string };
  courses: {
    id: string;
    tipo: CursoTipo;
    inicio: string;
    finalCurso: string;
    levels: {
      id: string;
      codigo: NivelCodigo;
      nombre: string;
      orden: number;
      lessons: { id: string; orden: number; titulo: string; quizPracticaId: string }[];
      quizLevelUpId: string;
    }[];
  }[];
}

export interface CampaignListItem {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  estado: EstadoCampania;
  cursos: number;
}

export interface CampaignDetail {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  estado: EstadoCampania;
  courses: {
    id: string;
    tipo: CursoTipo;
    inicio: string;
    finalCurso: string;
    niveles: {
      id: string;
      codigo: string;
      nombre: string;
      orden: number;
      lecciones: { id: string; orden: number; titulo: string }[];
      cuestionarios: { id: string; tipo: string; titulo: string; leccionOrden: number | null }[];
    }[];
  }[];
}
