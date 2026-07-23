import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";

export interface QuizInfo {
  id: string;
  tipo: "PRACTICA" | "LEVEL_UP";
  titulo: string;
  levelId: string;
  nivel: string;
  courseId: string;
}

export async function getQuizInfo(quizId: string): Promise<QuizInfo | null> {
  return queryOne<QuizInfo>(
    `SELECT q.id, q.tipo::text AS tipo, q.titulo, q.level_id AS "levelId",
            n.nombre AS nivel, n.course_id AS "courseId"
       FROM catalog_quiz q
       JOIN catalog_level n ON n.id = q.level_id
      WHERE q.id = $1`,
    [quizId],
  );
}

/** ¿El niño está matriculado (ACTIVA) en un salón del curso del cuestionario? */
export async function ninoMatriculadoEnCurso(
  childPersonId: string,
  courseId: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT e.id
       FROM enrollment_enrollment e
       JOIN scheduling_classroom cl ON cl.id = e.classroom_id
      WHERE e.child_person_id = $1 AND e.estado = 'ACTIVA' AND cl.course_id = $2
      LIMIT 1`,
    [childPersonId, courseId],
  );
  return row !== null;
}

export async function insertAttempt(input: {
  quizId: string;
  childPersonId: string;
  score: number;
  aprobado: boolean;
  registradoPor: string;
}): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO assessment_attempt
       (id, quiz_id, child_person_id, score, aprobado, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.quizId, input.childPersonId, input.score, input.aprobado, input.registradoPor],
    undefined,
  );
  return id;
}

export interface AttemptListItem {
  id: string;
  quizId: string;
  quizTitulo: string;
  tipo: string;
  nivel: string;
  score: number;
  aprobado: boolean;
  createdAt: Date;
}

export async function attemptsDeNino(childPersonId: string): Promise<AttemptListItem[]> {
  return queryRows<AttemptListItem>(
    `SELECT a.id, a.quiz_id AS "quizId", q.titulo AS "quizTitulo",
            q.tipo::text AS tipo, n.nombre AS nivel, a.score, a.aprobado,
            a.created_at AS "createdAt"
       FROM assessment_attempt a
       JOIN catalog_quiz q ON q.id = a.quiz_id
       JOIN catalog_level n ON n.id = q.level_id
      WHERE a.child_person_id = $1
      ORDER BY a.created_at DESC
      LIMIT 100`,
    [childPersonId],
  );
}

/** ¿Ya tiene un intento APROBADO de este quiz? (para la progresión, Fase 9) */
export async function tieneAprobado(childPersonId: string, quizId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM assessment_attempt
      WHERE child_person_id = $1 AND quiz_id = $2 AND aprobado = true
      LIMIT 1`,
    [childPersonId, quizId],
  );
  return row !== null;
}
