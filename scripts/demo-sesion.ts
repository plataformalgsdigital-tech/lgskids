/**
 * Crea un EVENTO de ejemplo con varios estudiantes, para poder ver el modal
 * del calendario con una lista poblada.
 *
 * Todo pasa por los caminos reales —`crearCampania`, `crearSalon`, `crearNino`,
 * `crearContrato` + `aprobarContrato`— nunca por SQL crudo: el alta de un
 * alumno tiene UN solo lugar transaccional (regla 5) y la lista del salón se
 * DERIVA de las matrículas activas (Fase 7). Insertar a mano dejaría datos que
 * la aplicación no sabría interpretar.
 *
 *   pnpm demo:sesion
 */
import { crearCampania } from "@/modules/catalog";
import { aprobarContrato, crearContrato } from "@/modules/contracts";
import { crearNino } from "@/modules/people";
import { crearSalon } from "@/modules/scheduling";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { logger } from "@/platform/logging/logger";

try {
  process.loadEnvFile(".env");
} catch {
  /* CI define las variables directamente */
}

const ADMIN = "00000000-0000-0000-0000-000000000000";
const sufijo = Math.random().toString(36).slice(2, 6);

/** Niños de la demo. Todos ~8 años para que caigan en JUNIOR. */
const NINOS = [
  ["Sofía", "Restrepo"],
  ["Mateo", "Guajardo"],
  ["Valentina", "Huerta"],
  ["Emiliano", "Varón"],
  ["Isabella", "Montero"],
  ["Tomás", "Miranda"],
  ["Antonia", "Vásquez"],
  ["Joaquín", "Beltrán"],
] as const;

async function main(): Promise<void> {
  logger.info("Creando campaña de demostración…");
  const campania = await crearCampania({
    actorUserId: ADMIN,
    nombre: `DEMO SESION ${sufijo}`,
    inicio: "2026-08-03",
    cursoInicio: "2026-08-17",
  });
  const curso = await queryOne<{ id: string }>(
    `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
    [campania.id],
  );
  const courseId = curso?.id as string;

  // Un guía real para el salón: así el evento muestra su nombre y el reporte
  // mensual por guía tiene a quién atribuirle las sesiones.
  const guia = await queryOne<{ id: string; username: string }>(
    `SELECT u.id, u.username FROM identity_user u
       JOIN access_user_role ur ON ur.user_id = u.id
       JOIN access_role r ON r.id = ur.role_id
      WHERE r.code = 'guia' AND u.estado = 'ACTIVO'
      LIMIT 1`,
  );

  const nombreSalon = `JUNIOR Demo ${sufijo}`;
  logger.info(`Creando salón ${nombreSalon} (guía: ${guia?.username ?? "sin asignar"})…`);
  const salon = await crearSalon({
    actorUserId: ADMIN,
    courseId,
    nombre: nombreSalon,
    cupo: 12,
    ...(guia !== null && { guiaUserId: guia.id }),
    meetingUrl: "https://meet.google.com/demo-lgs-kids",
    timezone: "America/Bogota",
    holidayCountry: "CO",
    slots: [
      { tipo: "SESION", diaSemana: 2, horaLocal: "16:00" }, // martes
      { tipo: "SESION", diaSemana: 4, horaLocal: "16:00" }, // jueves
      { tipo: "CLUB", diaSemana: 6, horaLocal: "10:00" }, // sábado
    ],
  });

  let matriculados = 0;
  for (const [nombres, apellidos] of NINOS) {
    const doc = `D${sufijo}-${String(matriculados + 1).padStart(2, "0")}`;
    const { ninoId } = await crearNino({
      actorUserId: ADMIN,
      nino: {
        nombres,
        apellidos,
        fechaNacimiento: "2018-06-01",
        docTipo: "TI",
        docNumero: doc,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: `Apoderado de ${nombres}`,
        apellidos,
        docTipo: "CC",
        docNumero: `${doc}-A`,
        countryCode: "CO",
        telefono: "+573000000000",
      },
    });

    // El titular del contrato debe ser un adulto: el apoderado del niño.
    const apo = await queryOne<{ apoderado_id: string }>(
      `SELECT apoderado_id FROM people_guardianship WHERE nino_id = $1 LIMIT 1`,
      [ninoId],
    );
    const contractId = await crearContrato({
      actorUserId: ADMIN,
      titularId: apo?.apoderado_id as string,
      beneficiarioId: ninoId,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: "2026-08-03",
      finalContrato: "2026-12-20",
    });

    // Aprobar CON salón = alta única + matrícula ACTIVA en un solo lugar.
    await aprobarContrato({ actorUserId: ADMIN, contractId, classroomId: salon.id });
    matriculados++;
  }

  // Una sesión YA pasada: sirve para probar registrar la sesión y la ficha.
  const sesiones = await queryRows<{ id: string; fecha: string; numero: number }>(
    `SELECT id, fecha::text AS fecha, numero
       FROM scheduling_session
      WHERE classroom_id = $1 AND tipo = 'SESION' AND starts_at < now()
      ORDER BY starts_at DESC
      LIMIT 1`,
    [salon.id],
  );
  const sesion = sesiones[0];

  // El salón queda sellado como dictado por el guía, para el reporte mensual.
  if (sesion !== undefined && guia !== null) {
    await execute(
      `UPDATE scheduling_session SET guia_user_id = $2 WHERE classroom_id = $1`,
      [salon.id, guia.id],
    );
  }

  logger.info("═══════════════════════════════════════════════");
  logger.info("  EVENTO DE EJEMPLO LISTO");
  logger.info(`  Campaña:      ${campania.nombre}`);
  logger.info(`  Salón:        ${nombreSalon}`);
  logger.info(`  Guía:         ${guia?.username ?? "sin asignar"}`);
  logger.info(`  Matriculados: ${String(matriculados)}`);
  logger.info(`  Sesiones:     ${String(salon.sesionesGeneradas)}`);
  if (sesion !== undefined) {
    logger.info(`  Sesión ya dictada: ${sesion.fecha} (N.º ${String(sesion.numero)})`);
    logger.info(`  Abre /panel/calendario en ${sesion.fecha} y haz clic en el evento.`);
  }
  logger.info("═══════════════════════════════════════════════");
}

main()
  .catch((e: unknown) => {
    logger.error(`Falló la demo: ${String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => void closePool());
