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
    `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
     VALUES ($1, $2, $3::date, $4::date, $5::date, now())`,
    [campaign.id, campaign.nombre, campaign.inicio, campaign.fin, campaign.finalVenta],
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
        `INSERT INTO catalog_level (id, course_id, codigo, orden, nombre, duracion_meses)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [level.id, course.id, level.codigo, level.orden, level.nombre, level.duracionMeses],
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
  finalVenta: string;
  cursoInicio: string | null;
  cursos: number;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const rows = await queryRows<{
    id: string;
    nombre: string;
    inicio: string;
    fin: string;
    finalVenta: string;
    cursoInicio: string | null;
    cursos: string;
  }>(
    `SELECT c.id, c.nombre, c.inicio::text AS inicio, c.fin::text AS fin,
            c.final_venta::text AS "finalVenta",
            min(cu.inicio)::text AS "cursoInicio",
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
  finalVenta: string;
}

export async function getCampaignHeader(id: string): Promise<CampaignHeaderRow | null> {
  return queryOne<CampaignHeaderRow>(
    `SELECT id, nombre, inicio::text AS inicio, fin::text AS fin,
            final_venta::text AS "finalVenta"
       FROM catalog_campaign WHERE id = $1`,
    [id],
  );
}

/** Edita SOLO la vigencia (fin) y el cierre de matrícula (final_venta) de la
 * campaña. NO toca `catalog_course.final_curso` (regla dura 1: nunca se
 * reescribe; las sesiones ya generadas no se ven afectadas). */
export async function updateCampaignFechas(
  id: string,
  fechas: { fin: string; finalVenta: string },
): Promise<void> {
  await execute(
    `UPDATE catalog_campaign
        SET fin = $2::date, final_venta = $3::date, updated_at = now()
      WHERE id = $1`,
    [id, fechas.fin, fechas.finalVenta],
  );
}

// ============================================================
// Referencia curricular (material/video/actividades/evaluación)
// ============================================================

// ---- Tabla maestra de referencia de cursos (catalog_curso) ----

export interface CursoReferenciaInput {
  curso: string; // JUNIOR | YOUNGSTER
  nivel: string; // ROOKIE | CHAMPION | ELITE | LEGENDARY | ULTIMATE
  modulo: string | null;
  leccion: string;
  orden: number;
  contenido: string | null;
  video: string | null;
  clubes: unknown[];
  materialUsuario: unknown[];
  materialGuia: unknown[];
  actividades: unknown[];
  recursos: unknown[];
}

export interface CursoReferenciaRow extends CursoReferenciaInput {
  id: string;
}

const SELECT_CURSO = `SELECT id, curso::text AS curso, nivel, modulo, leccion, orden,
    contenido, video,
    COALESCE(clubes, '[]'::jsonb) AS clubes,
    COALESCE(material_usuario, '[]'::jsonb) AS "materialUsuario",
    COALESCE(material_guia, '[]'::jsonb) AS "materialGuia",
    COALESCE(actividades, '[]'::jsonb) AS actividades,
    COALESCE(recursos, '[]'::jsonb) AS recursos
  FROM catalog_curso`;

export async function listCursoReferencia(filtros?: {
  curso?: string | undefined;
  nivel?: string | undefined;
}): Promise<CursoReferenciaRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filtros?.curso !== undefined && filtros.curso !== "") {
    values.push(filtros.curso);
    where.push(`curso = $${values.length}::catalog_course_tipo`);
  }
  if (filtros?.nivel !== undefined && filtros.nivel !== "") {
    values.push(filtros.nivel);
    where.push(`nivel = $${values.length}`);
  }
  return queryRows<CursoReferenciaRow>(
    `${SELECT_CURSO} ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY curso, nivel, orden, leccion`,
    values,
  );
}

export async function getCursoReferencia(id: string): Promise<CursoReferenciaRow | null> {
  return queryOne<CursoReferenciaRow>(`${SELECT_CURSO} WHERE id = $1`, [id]);
}

export async function existsCursoReferenciaKey(
  curso: string,
  nivel: string,
  modulo: string | null,
  leccion: string,
  exceptId?: string,
): Promise<boolean> {
  const values: unknown[] = [curso, nivel, modulo ?? "", leccion.trim()];
  let extra = "";
  if (exceptId !== undefined) {
    values.push(exceptId);
    extra = ` AND id <> $${values.length}`;
  }
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM catalog_curso
      WHERE curso = $1::catalog_course_tipo AND nivel = $2
        AND COALESCE(modulo, '') = $3 AND lower(leccion) = lower($4)${extra}`,
    values,
  );
  return row !== null;
}

function cursoParams(input: CursoReferenciaInput): unknown[] {
  return [
    input.curso,
    input.nivel,
    input.modulo,
    input.leccion.trim(),
    input.orden,
    input.contenido,
    input.video,
    JSON.stringify(input.clubes),
    JSON.stringify(input.materialUsuario),
    JSON.stringify(input.materialGuia),
    JSON.stringify(input.actividades),
    JSON.stringify(input.recursos),
  ];
}

export async function insertCursoReferencia(id: string, input: CursoReferenciaInput): Promise<void> {
  await execute(
    `INSERT INTO catalog_curso
       (id, curso, nivel, modulo, leccion, orden, contenido, video,
        clubes, material_usuario, material_guia, actividades, recursos, updated_at)
     VALUES ($1, $2::catalog_course_tipo, $3, $4, $5, $6, $7, $8,
             $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, now())`,
    [id, ...cursoParams(input)],
  );
}

export async function updateCursoReferencia(id: string, input: CursoReferenciaInput): Promise<void> {
  await execute(
    `UPDATE catalog_curso
        SET curso = $2::catalog_course_tipo, nivel = $3, modulo = $4, leccion = $5,
            orden = $6, contenido = $7, video = $8,
            clubes = $9::jsonb, material_usuario = $10::jsonb, material_guia = $11::jsonb,
            actividades = $12::jsonb, recursos = $13::jsonb, updated_at = now()
      WHERE id = $1`,
    [id, ...cursoParams(input)],
  );
}

export async function deleteCursoReferencia(id: string): Promise<void> {
  await execute(`DELETE FROM catalog_curso WHERE id = $1`, [id]);
}

export interface ReferenciaNivel {
  descripcion: string | null;
  recursos: unknown[];
}

export async function getReferenciaNivel(levelId: string): Promise<ReferenciaNivel | null> {
  return queryOne<ReferenciaNivel>(
    `SELECT descripcion, COALESCE(recursos, '[]'::jsonb) AS recursos
       FROM catalog_level WHERE id = $1`,
    [levelId],
  );
}

export async function updateReferenciaNivel(levelId: string, ref: ReferenciaNivel): Promise<void> {
  await execute(
    `UPDATE catalog_level SET descripcion = $2, recursos = $3::jsonb WHERE id = $1`,
    [levelId, ref.descripcion, JSON.stringify(ref.recursos)],
  );
}

export interface ReferenciaQuiz {
  modo: string;
  minutos: number | null;
  preguntas: unknown[];
}

export async function getReferenciaQuiz(quizId: string): Promise<ReferenciaQuiz | null> {
  return queryOne<ReferenciaQuiz>(
    `SELECT modo, minutos, COALESCE(contenido, '[]'::jsonb) AS preguntas
       FROM catalog_quiz WHERE id = $1`,
    [quizId],
  );
}

export async function updateReferenciaQuiz(quizId: string, ref: ReferenciaQuiz): Promise<void> {
  await execute(
    `UPDATE catalog_quiz SET modo = $2, minutos = $3, contenido = $4::jsonb WHERE id = $1`,
    [quizId, ref.modo, ref.minutos, JSON.stringify(ref.preguntas)],
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
  duracion_meses: number;
}

export async function getCourseLevels(campaignId: string): Promise<CourseTreeRow[]> {
  return queryRows<CourseTreeRow>(
    `SELECT cu.id AS course_id, cu.tipo::text AS tipo,
            cu.inicio::text AS curso_inicio, cu.final_curso::text AS final_curso,
            n.id AS level_id, n.codigo, n.nombre AS nivel_nombre, n.orden AS nivel_orden,
            n.duracion_meses
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
