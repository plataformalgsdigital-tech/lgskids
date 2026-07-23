import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import type { CampaignGraph } from "../application/ports";

/**
 * Acceso a datos de catalog. Solo esta capa escribe las tablas catalog_*
 * (regla 3.4.2). Las columnas DATE se leen SIEMPRE con ::text para que
 * ninguna zona horaria las contamine.
 */

export async function campaignNombreExists(nombre: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM catalog_campaign WHERE lower(nombre) = lower($1)`,
    [nombre],
  );
  return row !== null;
}

/** Inserta el grafo completo de la campaña. SIEMPRE dentro de la transacción recibida. */
export async function insertCampaignGraph(tx: PoolClient, graph: CampaignGraph): Promise<void> {
  const { campaign } = graph;
  await execute(
    `INSERT INTO catalog_campaign (id, nombre, inicio, fin, updated_at)
     VALUES ($1, $2, $3::date, $4::date, now())`,
    [campaign.id, campaign.nombre, campaign.inicio, campaign.fin],
    tx,
  );
  for (const course of graph.courses) {
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, $3::catalog_course_tipo, $4::date, $5::date, now())`,
      [course.id, campaign.id, course.tipo, course.inicio, course.finalCurso],
      tx,
    );
    for (const level of course.levels) {
      await execute(
        `INSERT INTO catalog_level (id, course_id, codigo, orden, nombre)
         VALUES ($1, $2, $3, $4, $5)`,
        [level.id, course.id, level.codigo, level.orden, level.nombre],
        tx,
      );
      for (const lesson of level.lessons) {
        await execute(
          `INSERT INTO catalog_lesson (id, level_id, orden, titulo)
           VALUES ($1, $2, $3, $4)`,
          [lesson.id, level.id, lesson.orden, lesson.titulo],
          tx,
        );
        await execute(
          `INSERT INTO catalog_quiz (id, level_id, lesson_id, tipo, titulo)
           VALUES ($1, $2, $3, 'PRACTICA', $4)`,
          [lesson.quizPracticaId, level.id, lesson.id, `Práctica — ${lesson.titulo}`],
          tx,
        );
      }
      await execute(
        `INSERT INTO catalog_quiz (id, level_id, lesson_id, tipo, titulo)
         VALUES ($1, $2, NULL, 'LEVEL_UP', $3)`,
        [level.quizLevelUpId, level.id, `Level Up — ${level.nombre}`],
        tx,
      );
    }
  }
}

export interface CampaignRow {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  cursos: number;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const rows = await queryRows<{
    id: string;
    nombre: string;
    inicio: string;
    fin: string;
    cursos: string;
  }>(
    `SELECT c.id, c.nombre, c.inicio::text AS inicio, c.fin::text AS fin,
            count(cu.id)::text AS cursos
       FROM catalog_campaign c
       LEFT JOIN catalog_course cu ON cu.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.inicio DESC, c.nombre`,
  );
  return rows.map((r) => ({ ...r, cursos: Number(r.cursos) }));
}

export interface CampaignHeaderRow {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
}

export async function getCampaignHeader(id: string): Promise<CampaignHeaderRow | null> {
  return queryOne<CampaignHeaderRow>(
    `SELECT id, nombre, inicio::text AS inicio, fin::text AS fin
       FROM catalog_campaign WHERE id = $1`,
    [id],
  );
}

export interface CourseTreeRow {
  course_id: string;
  tipo: string;
  curso_inicio: string;
  final_curso: string;
  level_id: string;
  codigo: string;
  nivel_nombre: string;
  nivel_orden: number;
}

export async function getCourseLevels(campaignId: string): Promise<CourseTreeRow[]> {
  return queryRows<CourseTreeRow>(
    `SELECT cu.id AS course_id, cu.tipo::text AS tipo,
            cu.inicio::text AS curso_inicio, cu.final_curso::text AS final_curso,
            n.id AS level_id, n.codigo, n.nombre AS nivel_nombre, n.orden AS nivel_orden
       FROM catalog_course cu
       JOIN catalog_level n ON n.course_id = cu.id
      WHERE cu.campaign_id = $1
      ORDER BY cu.tipo, n.orden`,
    [campaignId],
  );
}

export interface LessonRow {
  level_id: string;
  id: string;
  orden: number;
  titulo: string;
}

export async function getLessonsByCampaign(campaignId: string): Promise<LessonRow[]> {
  return queryRows<LessonRow>(
    `SELECT l.level_id, l.id, l.orden, l.titulo
       FROM catalog_lesson l
       JOIN catalog_level n ON n.id = l.level_id
       JOIN catalog_course cu ON cu.id = n.course_id
      WHERE cu.campaign_id = $1
      ORDER BY l.orden`,
    [campaignId],
  );
}

export interface QuizDeCurso {
  id: string;
  tipo: string;
  titulo: string;
  nivel: string;
  nivelOrden: number;
  leccionOrden: number | null;
}

/** Cuestionarios de un curso, ordenados por nivel y lección (para registrar intentos). */
export async function getQuizzesByCourse(courseId: string): Promise<QuizDeCurso[]> {
  return queryRows<QuizDeCurso>(
    `SELECT q.id, q.tipo::text AS tipo, q.titulo,
            n.nombre AS nivel, n.orden AS "nivelOrden", l.orden AS "leccionOrden"
       FROM catalog_quiz q
       JOIN catalog_level n ON n.id = q.level_id
       LEFT JOIN catalog_lesson l ON l.id = q.lesson_id
      WHERE n.course_id = $1
      ORDER BY n.orden, q.tipo = 'LEVEL_UP', l.orden`,
    [courseId],
  );
}

export interface QuizRow {
  level_id: string;
  id: string;
  tipo: string;
  titulo: string;
  leccion_orden: number | null;
}

export async function getQuizzesByCampaign(campaignId: string): Promise<QuizRow[]> {
  return queryRows<QuizRow>(
    `SELECT q.level_id, q.id, q.tipo::text AS tipo, q.titulo, l.orden AS leccion_orden
       FROM catalog_quiz q
       JOIN catalog_level n ON n.id = q.level_id
       JOIN catalog_course cu ON cu.id = n.course_id
       LEFT JOIN catalog_lesson l ON l.id = q.lesson_id
      WHERE cu.campaign_id = $1
      ORDER BY q.tipo, l.orden NULLS LAST`,
    [campaignId],
  );
}
