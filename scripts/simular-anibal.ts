/**
 * SIMULACIÓN (dev): marca 2 unidades de ROOKIE como completadas para "Anibal",
 * registrando 2 intentos de PRÁCTICA aprobados por el CAMINO REAL
 * (registrarIntento → dispara la progresión). Idempotente: si ya están
 * aprobadas no duplica el conteo.
 *
 * Uso:  pnpm tsx scripts/simular-anibal.ts
 */
import { registrarIntento } from "@/modules/assessment";
import { closePool } from "@/platform/db/pool";
import { queryOne, queryRows } from "@/platform/db/query";
import { logger } from "@/platform/logging/logger";

try {
  process.loadEnvFile(".env");
} catch {
  /* variables ya definidas */
}

const ADMIN = "00000000-0000-0000-0000-000000000000";
const UNIDADES_A_COMPLETAR = 2;

async function main(): Promise<void> {
  // 1) Anibal: matrícula ACTIVA → niño + curso.
  const alumno = await queryOne<{
    childPersonId: string;
    courseId: string;
    nombre: string;
    username: string | null;
  }>(
    `SELECT e.child_person_id AS "childPersonId",
            cl.course_id       AS "courseId",
            p.nombres || ' ' || p.apellidos AS nombre,
            u.username         AS username
       FROM enrollment_enrollment e
       JOIN scheduling_classroom cl ON cl.id = e.classroom_id
       JOIN people_person p ON p.id = e.child_person_id
       LEFT JOIN identity_user u ON u.id = p.user_id
      WHERE e.estado = 'ACTIVA' AND p.nombres ILIKE 'Anibal%'
      ORDER BY e.created_at DESC
      LIMIT 1`,
  );
  if (alumno === null) {
    throw new Error("No encontré una matrícula ACTIVA de un niño llamado 'Anibal…'.");
  }
  logger.info(`Alumno: ${alumno.nombre} (usuario: ${alumno.username ?? "—"})`);

  // 2) Primeras N prácticas de ROOKIE de su curso (por orden de lección).
  const quizzes = await queryRows<{ id: string; titulo: string }>(
    `SELECT q.id, q.titulo
       FROM catalog_quiz q
       JOIN catalog_level  n ON n.id = q.level_id
       JOIN catalog_lesson l ON l.id = q.lesson_id
      WHERE n.course_id = $1 AND n.codigo = 'ROOKIE' AND q.tipo = 'PRACTICA'
      ORDER BY l.orden
      LIMIT $2`,
    [alumno.courseId, UNIDADES_A_COMPLETAR],
  );
  if (quizzes.length === 0) {
    throw new Error("El curso de Anibal no tiene prácticas de ROOKIE (¿campaña sin catálogo?).");
  }

  // 3) Registrar intento APROBADO (100) por cada una.
  let progresionFinal: unknown = null;
  for (const q of quizzes) {
    const r = await registrarIntento({
      actorUserId: ADMIN,
      childPersonId: alumno.childPersonId,
      quizId: q.id,
      score: 100,
    });
    logger.info(`  ✔ ${q.titulo} → aprobado=${r.aprobado}`);
    progresionFinal = r.progresion;
  }

  logger.info("═══════════════════════════════════════════════");
  logger.info(`  Rookie: ${quizzes.length} unidad(es) completada(s) para ${alumno.nombre}.`);
  logger.info(`  Progresión: ${JSON.stringify(progresionFinal)}`);
  logger.info(`  Entra a /mi-panel como ${alumno.username ?? "(su usuario)"} y abre "¿Cómo voy?" / "Avance".`);
  logger.info("═══════════════════════════════════════════════");
}

main()
  .then(() => closePool())
  .catch(async (e) => {
    logger.error(e instanceof Error ? e.message : String(e));
    await closePool();
    process.exit(1);
  });
