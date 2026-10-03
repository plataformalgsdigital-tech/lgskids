import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";

type Queryable = Pick<PoolClient, "query">;

/** Curso del salón de la matrícula ACTIVA del niño (con nombres para la vista). */
export async function getCursoActivoDeNino(
  childPersonId: string,
): Promise<{ courseId: string; tipo: string; campania: string } | null> {
  return queryOne(
    `SELECT cu.id AS "courseId", cu.tipo::text AS tipo, ca.nombre AS campania
       FROM enrollment_enrollment e
       JOIN scheduling_classroom cl ON cl.id = e.classroom_id
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
      WHERE e.child_person_id = $1 AND e.estado = 'ACTIVA'
      LIMIT 1`,
    [childPersonId],
  );
}

export interface EstructuraNivel {
  levelId: string;
  codigo: string;
  nombre: string;
  orden: number;
  practicaQuizIds: string[];
  levelUpQuizId: string | null;
}

/** Estructura curricular del curso: niveles con sus quizzes. */
export async function getEstructuraCurso(courseId: string): Promise<EstructuraNivel[]> {
  interface Row {
    level_id: string;
    codigo: string;
    nombre: string;
    orden: number;
    quiz_id: string;
    tipo: string;
  }
  const rows = await queryRows<Row>(
    `SELECT n.id AS level_id, n.codigo, n.nombre, n.orden, q.id AS quiz_id, q.tipo::text AS tipo
       FROM catalog_level n
       JOIN catalog_quiz q ON q.level_id = n.id
      WHERE n.course_id = $1
      ORDER BY n.orden`,
    [courseId],
  );
  const niveles = new Map<string, EstructuraNivel>();
  for (const row of rows) {
    let nivel = niveles.get(row.level_id);
    if (nivel === undefined) {
      nivel = {
        levelId: row.level_id,
        codigo: row.codigo,
        nombre: row.nombre,
        orden: row.orden,
        practicaQuizIds: [],
        levelUpQuizId: null,
      };
      niveles.set(row.level_id, nivel);
    }
    if (row.tipo === "LEVEL_UP") {
      nivel.levelUpQuizId = row.quiz_id;
    } else {
      nivel.practicaQuizIds.push(row.quiz_id);
    }
  }
  return [...niveles.values()].sort((a, b) => a.orden - b.orden);
}

/** Set de quizzes con al menos un intento APROBADO del niño. */
export async function getAprobadosDeNino(childPersonId: string): Promise<Set<string>> {
  const rows = await queryRows<{ quiz_id: string }>(
    `SELECT DISTINCT quiz_id FROM assessment_attempt
      WHERE child_person_id = $1 AND aprobado = true`,
    [childPersonId],
  );
  return new Set(rows.map((r) => r.quiz_id));
}

export async function upsertProgress(
  tx: Queryable,
  input: {
    childPersonId: string;
    levelId: string;
    leccionesCompletadas: number;
    levelUpAprobado: boolean;
    completado: boolean;
    convalidado: boolean;
  },
): Promise<void> {
  await execute(
    `INSERT INTO progression_level_progress
       (id, child_person_id, level_id, lecciones_completadas, level_up_aprobado,
        estado, completado_en, convalidado, updated_at)
     VALUES ($1, $2, $3, $4, $5,
             $6::progression_estado, CASE WHEN $6 = 'COMPLETADO' THEN now() END, $7, now())
     ON CONFLICT (child_person_id, level_id) DO UPDATE
        SET lecciones_completadas = $4,
            level_up_aprobado = $5,
            convalidado = $7,
            estado = $6::progression_estado,
            completado_en = CASE
              WHEN $6 = 'COMPLETADO' AND progression_level_progress.completado_en IS NULL THEN now()
              WHEN $6 = 'COMPLETADO' THEN progression_level_progress.completado_en
              ELSE NULL
            END,
            updated_at = now()`,
    [
      newId(),
      input.childPersonId,
      input.levelId,
      input.leccionesCompletadas,
      input.levelUpAprobado,
      input.completado ? "COMPLETADO" : "EN_CURSO",
      input.convalidado,
    ],
    tx,
  );
}

// ── Ubicación académica ─────────────────────────────────────────────────────

export interface Ubicacion {
  levelId: string;
  ordenNivel: number;
  lecciones: number;
  motivo: string;
  ubicadoPor: string | null;
  updatedAt: string;
}

export async function getUbicacion(
  childPersonId: string,
  courseId: string,
  client?: Queryable,
): Promise<Ubicacion | null> {
  return queryOne<Ubicacion>(
    `SELECT u.level_id AS "levelId", n.orden AS "ordenNivel", u.lecciones, u.motivo,
            u.ubicado_por AS "ubicadoPor", u.updated_at::text AS "updatedAt"
       FROM progression_ubicacion u
       JOIN catalog_level n ON n.id = u.level_id
      WHERE u.child_person_id = $1 AND u.course_id = $2`,
    [childPersonId, courseId],
    client,
  );
}

/** Nivel con su curso, su orden y cuántas prácticas tiene. */
export async function getNivelParaUbicar(
  levelId: string,
  client?: Queryable,
): Promise<{
  levelId: string;
  courseId: string;
  codigo: string;
  nombre: string;
  orden: number;
  totalPracticas: number;
  esPrimero: boolean;
} | null> {
  return queryOne(
    `SELECT n.id AS "levelId", n.course_id AS "courseId", n.codigo, n.nombre, n.orden,
            (SELECT count(*)::int FROM catalog_quiz q
              WHERE q.level_id = n.id AND q.tipo::text <> 'LEVEL_UP') AS "totalPracticas",
            n.orden = (SELECT min(n2.orden) FROM catalog_level n2 WHERE n2.course_id = n.course_id)
              AS "esPrimero"
       FROM catalog_level n WHERE n.id = $1`,
    [levelId],
    client,
  );
}

/** Curso de la matrícula ACTIVA del niño, leído DENTRO de la transacción. */
export async function getCursoActivoTx(
  childPersonId: string,
  client: Queryable,
): Promise<string | null> {
  const row = await queryOne<{ courseId: string }>(
    `SELECT cl.course_id AS "courseId"
       FROM enrollment_enrollment e
       JOIN scheduling_classroom cl ON cl.id = e.classroom_id
      WHERE e.child_person_id = $1 AND e.estado = 'ACTIVA'
      LIMIT 1`,
    [childPersonId],
    client,
  );
  return row?.courseId ?? null;
}

export async function upsertUbicacion(
  tx: Queryable,
  input: {
    childPersonId: string;
    courseId: string;
    levelId: string;
    lecciones: number;
    motivo: string;
    ubicadoPor: string;
  },
): Promise<void> {
  await execute(
    `INSERT INTO progression_ubicacion
       (id, child_person_id, course_id, level_id, lecciones, motivo, ubicado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (child_person_id, course_id) DO UPDATE
        SET level_id = $4, lecciones = $5, motivo = $6, ubicado_por = $7, updated_at = now()`,
    [
      newId(),
      input.childPersonId,
      input.courseId,
      input.levelId,
      input.lecciones,
      input.motivo,
      input.ubicadoPor,
    ],
    tx,
  );
}

export async function deleteUbicacion(
  tx: Queryable,
  childPersonId: string,
  courseId: string,
): Promise<void> {
  await execute(
    `DELETE FROM progression_ubicacion WHERE child_person_id = $1 AND course_id = $2`,
    [childPersonId, courseId],
    tx,
  );
}

export async function tieneAward(
  tx: Queryable,
  childPersonId: string,
  tipo: "MEDALLA" | "DIPLOMA",
  levelId: string | null,
  courseId: string | null,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM progression_award
      WHERE child_person_id = $1 AND tipo = $2::progression_award_tipo
        AND level_id IS NOT DISTINCT FROM $3
        AND course_id IS NOT DISTINCT FROM $4`,
    [childPersonId, tipo, levelId, courseId],
    tx,
  );
  return row !== null;
}

export async function otorgarAward(
  tx: Queryable,
  input: {
    childPersonId: string;
    tipo: "MEDALLA" | "DIPLOMA";
    levelId: string | null;
    courseId: string | null;
  },
): Promise<void> {
  await execute(
    `INSERT INTO progression_award (id, child_person_id, tipo, level_id, course_id)
     VALUES ($1, $2, $3::progression_award_tipo, $4, $5)
     ON CONFLICT DO NOTHING`,
    [newId(), input.childPersonId, input.tipo, input.levelId, input.courseId],
    tx,
  );
}

/** Niños con matrícula activa (para el recálculo global del worker). */
export async function ninosActivos(): Promise<string[]> {
  const rows = await queryRows<{ child_person_id: string }>(
    `SELECT DISTINCT child_person_id FROM enrollment_enrollment WHERE estado = 'ACTIVA'`,
  );
  return rows.map((r) => r.child_person_id);
}
