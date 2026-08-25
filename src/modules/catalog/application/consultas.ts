import { env } from "@/platform/config/env";
import { NotFoundError } from "@/platform/errors";
import { operationalDate } from "@/platform/time";
import { derivarEstadoCampania } from "../domain/campania";
import type { CampaignDetail, CampaignListItem } from "./ports";
import {
  getCampaignHeader,
  getCourseLevels,
  getLessonsByCampaign,
  getQuizzesByCampaign,
  getQuizzesByCourse,
  listCampaigns,
  type QuizDeCurso,
} from "../infrastructure/catalog-repository";

/** Cuestionarios de un curso (registro de intentos en assessment). */
export async function cuestionariosDeCurso(courseId: string): Promise<QuizDeCurso[]> {
  return getQuizzesByCourse(courseId);
}

/**
 * "Hoy" para derivar el estado de una campaña GLOBAL: la fecha operativa en
 * la zona por defecto de la plataforma (las campañas no tienen país,
 * ADR-0009). Los reportes por país agruparán en SQL con su propia zona.
 */
function hoyOperativo(): string {
  return operationalDate(new Date(), env().OPERATIONAL_TIMEZONE_DEFAULT);
}

export async function listarCampanias(): Promise<CampaignListItem[]> {
  const hoy = hoyOperativo();
  const rows = await listCampaigns();
  return rows.map((row) => ({
    ...row,
    estado: derivarEstadoCampania(row.finalVenta, row.fin, hoy),
  }));
}

export async function detalleCampania(id: string): Promise<CampaignDetail> {
  const header = await getCampaignHeader(id);
  if (header === null) {
    throw new NotFoundError("La campaña no existe.");
  }
  const [courseLevels, lessons, quizzes] = await Promise.all([
    getCourseLevels(id),
    getLessonsByCampaign(id),
    getQuizzesByCampaign(id),
  ]);

  const lessonsByLevel = new Map<string, { id: string; orden: number; titulo: string }[]>();
  for (const lesson of lessons) {
    const list = lessonsByLevel.get(lesson.level_id) ?? [];
    list.push({ id: lesson.id, orden: lesson.orden, titulo: lesson.titulo });
    lessonsByLevel.set(lesson.level_id, list);
  }
  const quizzesByLevel = new Map<
    string,
    { id: string; tipo: string; titulo: string; leccionOrden: number | null }[]
  >();
  for (const quiz of quizzes) {
    const list = quizzesByLevel.get(quiz.level_id) ?? [];
    list.push({
      id: quiz.id,
      tipo: quiz.tipo,
      titulo: quiz.titulo,
      leccionOrden: quiz.leccion_orden,
    });
    quizzesByLevel.set(quiz.level_id, list);
  }

  const coursesMap = new Map<string, CampaignDetail["courses"][number]>();
  for (const row of courseLevels) {
    let course = coursesMap.get(row.course_id);
    if (course === undefined) {
      course = {
        id: row.course_id,
        tipo: row.tipo as CampaignDetail["courses"][number]["tipo"],
        inicio: row.curso_inicio,
        finalCurso: row.final_curso,
        niveles: [],
      };
      coursesMap.set(row.course_id, course);
    }
    course.niveles.push({
      id: row.level_id,
      codigo: row.codigo,
      nombre: row.nivel_nombre,
      orden: row.nivel_orden,
      duracionMeses: row.duracion_meses,
      lecciones: lessonsByLevel.get(row.level_id) ?? [],
      cuestionarios: quizzesByLevel.get(row.level_id) ?? [],
    });
  }

  return {
    ...header,
    estado: derivarEstadoCampania(header.finalVenta, header.fin, hoyOperativo()),
    courses: [...coursesMap.values()],
  };
}
