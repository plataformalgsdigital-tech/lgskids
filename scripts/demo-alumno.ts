/**
 * DEMO: crea de punta a punta un alumno matriculado con datos, para poder
 * REVISAR el panel del niño (/mi-panel). Cada corrida genera un alumno nuevo
 * e imprime su usuario y contraseña.
 *
 * Uso:  pnpm demo:alumno   (requiere Postgres arriba y migración aplicada)
 */
import { crearSalon } from "@/modules/scheduling";
import { crearCampania } from "@/modules/catalog";
import { crearNino } from "@/modules/people";
import { aprobarContrato, crearContrato } from "@/modules/contracts";
import { marcarAsistencia } from "@/modules/attendance";
import { registrarIntento } from "@/modules/assessment";
import { Argon2Hasher } from "@/modules/identity/infrastructure/argon2-hasher";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { logger } from "@/platform/logging/logger";

try {
  process.loadEnvFile(".env");
} catch {
  /* CI define las variables directamente */
}

const ADMIN = "00000000-0000-0000-0000-000000000000";
const sufijo = Math.random().toString(36).slice(2, 7);
const PASSWORD_DEMO = "DemoAlumno123";

async function main(): Promise<void> {
  // 1) Campaña (genera cursos Junior + Youngster con sus niveles/lecciones).
  const campania = await crearCampania({
    actorUserId: ADMIN,
    nombre: `DEMO ${sufijo}`,
    inicio: "2026-08-03",
    cursoInicio: "2026-08-17",
  });
  const curso = await queryOne<{ id: string }>(
    `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
    [campania.id],
  );
  const courseId = curso?.id as string;

  // 2) Salón con horario (2 sesiones + club) → genera todas las sesiones.
  const salon = await crearSalon({
    actorUserId: ADMIN,
    courseId,
    nombre: `Rookie Demo ${sufijo}`,
    cupo: 12,
    meetingUrl: "https://meet.google.com/demo-lgs-kids",
    timezone: "America/Bogota",
    holidayCountry: "CO",
    slots: [
      { tipo: "SESION", diaSemana: 2, horaLocal: "17:00" }, // martes
      { tipo: "SESION", diaSemana: 4, horaLocal: "17:00" }, // jueves
      { tipo: "CLUB", diaSemana: 6, horaLocal: "10:00" }, // sábado
    ],
  });

  // 3) Niño + apoderado (con teléfono para las notificaciones).
  const { ninoId } = await crearNino({
    actorUserId: ADMIN,
    nino: {
      nombres: "Sofía",
      apellidos: `Demo ${sufijo}`,
      fechaNacimiento: "2018-06-01", // ~8 años → JUNIOR
      docTipo: "TI",
      docNumero: `DEMO-${sufijo}`,
      countryCode: "CO",
    },
    apoderadoNuevo: {
      nombres: "Carolina",
      apellidos: `Demo ${sufijo}`,
      docTipo: "CC",
      docNumero: `DEMO-${sufijo}-A`,
      countryCode: "CO",
      telefono: "+573000000000",
    },
  });

  // 4) Contrato + APROBACIÓN con salón = alta única + matrícula.
  const contractId = await crearContrato({
    actorUserId: ADMIN,
    titularId: ninoId, // el titular puede ser el apoderado; para demo da igual
    beneficiarioId: ninoId,
    countryCode: "CO",
    tipoCurso: "JUNIOR",
    inicio: "2026-08-03",
    finalContrato: "2026-12-20",
  }).catch(async () => {
    // titular debe existir/activo: usar el apoderado del niño.
    const apo = await queryOne<{ apoderado_id: string }>(
      `SELECT apoderado_id FROM people_guardianship WHERE nino_id = $1 LIMIT 1`,
      [ninoId],
    );
    return crearContrato({
      actorUserId: ADMIN,
      titularId: apo?.apoderado_id as string,
      beneficiarioId: ninoId,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: "2026-08-03",
      finalContrato: "2026-12-20",
    });
  });

  const { credenciales } = await aprobarContrato({
    actorUserId: ADMIN,
    contractId,
    classroomId: salon.id,
  });
  const username = credenciales?.username as string;

  // 5) Marcar algo de asistencia (para poblar los contadores).
  const sesiones = await queryRows<{ id: string }>(
    `SELECT id FROM scheduling_session WHERE classroom_id = $1 ORDER BY starts_at LIMIT 3`,
    [salon.id],
  );
  if (sesiones[0]) {
    await marcarAsistencia({
      actorUserId: ADMIN,
      sessionId: sesiones[0].id,
      marcas: [{ childPersonId: ninoId, estado: "PRESENTE" }],
    });
  }
  if (sesiones[1]) {
    await marcarAsistencia({
      actorUserId: ADMIN,
      sessionId: sesiones[1].id,
      marcas: [
        { childPersonId: ninoId, estado: "JUSTIFICADO", justificacion: "cita médica (demo)" },
      ],
    });
  }

  // 6) Completar el nivel Rookie (4 prácticas + Level Up) → 🏅 medalla.
  const quizzes = await queryRows<{ id: string; tipo: string }>(
    `SELECT q.id, q.tipo::text AS tipo
       FROM catalog_quiz q JOIN catalog_level n ON n.id = q.level_id
      WHERE n.course_id = $1 AND n.codigo = 'ROOKIE'
      ORDER BY q.tipo`,
    [courseId],
  );
  for (const quiz of quizzes) {
    await registrarIntento({
      actorUserId: ADMIN,
      childPersonId: ninoId,
      quizId: quiz.id,
      score: 90,
    });
  }

  // 7) Fijar una contraseña conocida y quitar el cambio forzado (solo demo).
  const hash = await new Argon2Hasher().hash(PASSWORD_DEMO);
  await execute(
    `UPDATE identity_user
        SET password_hash = $2, debe_cambiar_password = false, updated_at = now()
      WHERE username = $1`,
    [username, hash],
  );

  logger.info("═══════════════════════════════════════════════");
  logger.info("  ALUMNO DEMO LISTO — entra en /login con:");
  logger.info(`  Usuario:    ${username}`);
  logger.info(`  Contraseña: ${PASSWORD_DEMO}`);
  logger.info("  (te llevará directo a /mi-panel)");
  logger.info("═══════════════════════════════════════════════");
}

main()
  .catch((error: unknown) => {
    logger.error("Demo falló", { error: String(error) });
    process.exitCode = 1;
  })
  .finally(() => closePool());
