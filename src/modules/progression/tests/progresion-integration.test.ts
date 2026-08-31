import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { crearNino } from "@/modules/people";
import { aprobarContrato, crearContrato } from "@/modules/contracts";
import { registrarIntento } from "@/modules/assessment";
import { marcarAsistencia } from "@/modules/attendance";
import { progresoDeNino, recalcularProgresion } from "../application/recalcular";

/**
 * INTEGRACIÓN Fase 9: el ciclo completo de progresión — 4 prácticas +
 * Level Up ⇒ nivel COMPLETADO ⇒ 🏅 medalla; idempotencia; recuperación
 * (la lección de LGS); y el disparo desde el camino de asistencia.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const sufijo = Math.random().toString(36).slice(2, 8);

describe.runIf(RUN)("progresión (integración)", () => {
  let campaignId: string;
  let courseId: string;
  let classroomId: string;
  let sessionId: string;
  let ninoId: string;
  let ninoUserId: string | null = null;
  let contractId: string;
  const practicas: string[] = [];
  let levelUpRookie: string;
  let levelChampionUp: string;

  beforeAll(async () => {
    campaignId = newId();
    courseId = newId();
    classroomId = newId();
    sessionId = newId();
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2026-08-03', '2026-10-25',
               ('2026-08-03'::date + INTERVAL '21 days')::date, now())`,
      [campaignId, `IT Prog ${sufijo}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-08-03', '2026-10-25', now())`,
      [courseId, campaignId],
    );
    // Dos niveles con 4 lecciones + Level Up cada uno (Rookie y Champion).
    for (const [orden, codigo, nombre] of [
      [1, "ROOKIE", "Rookie"],
      [2, "CHAMPION", "Champion"],
    ] as const) {
      const levelId = newId();
      await execute(
        `INSERT INTO catalog_level (id, course_id, codigo, orden, nombre) VALUES ($1, $2, $3, $4, $5)`,
        [levelId, courseId, codigo, orden, nombre],
      );
      for (let i = 1; i <= 4; i += 1) {
        const lessonId = newId();
        const quizId = newId();
        await execute(
          `INSERT INTO catalog_lesson (id, level_id, orden, titulo) VALUES ($1, $2, $3, $4)`,
          [lessonId, levelId, i, `Lección ${i}`],
        );
        await execute(
          `INSERT INTO catalog_quiz (id, level_id, lesson_id, tipo, titulo) VALUES ($1, $2, $3, 'PRACTICA', $4)`,
          [quizId, levelId, lessonId, `Práctica ${i}`],
        );
        if (codigo === "ROOKIE") practicas.push(quizId);
      }
      const upId = newId();
      await execute(
        `INSERT INTO catalog_quiz (id, level_id, lesson_id, tipo, titulo) VALUES ($1, $2, NULL, 'LEVEL_UP', $3)`,
        [upId, levelId, `Level Up ${nombre}`],
      );
      if (codigo === "ROOKIE") levelUpRookie = upId;
      else levelChampionUp = upId;
    }
    await execute(
      `INSERT INTO scheduling_classroom (id, course_id, nombre, cupo, timezone, holiday_country, updated_at)
       VALUES ($1, $2, 'Prog A', 10, 'America/Bogota', 'CO', now())`,
      [classroomId, courseId],
    );
    const slotId = newId();
    await execute(
      `INSERT INTO scheduling_slot (id, classroom_id, tipo, dia_semana, hora_local)
       VALUES ($1, $2, 'SESION', 2, '17:00')`,
      [slotId, classroomId],
    );
    await execute(
      `INSERT INTO scheduling_session (id, classroom_id, slot_id, tipo, fecha, starts_at, duracion_min, numero)
       VALUES ($1, $2, $3, 'SESION', '2026-08-04', '2026-08-04 22:00:00+00', 60, 1)`,
      [sessionId, classroomId, slotId],
    );
    const creado = await crearNino({
      actorUserId: ACTOR,
      nino: {
        nombres: "Emma",
        apellidos: `Prog${sufijo}`,
        fechaNacimiento: "2018-03-10",
        docTipo: "TI",
        docNumero: `PG-${sufijo}`,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: "Ana",
        apellidos: `Prog${sufijo}`,
        docTipo: "CC",
        docNumero: `PG-${sufijo}-A`,
        countryCode: "CO",
      },
    });
    ninoId = creado.ninoId;
    contractId = await crearContrato({
      actorUserId: ACTOR,
      titularId: creado.apoderadoId,
      beneficiarioId: ninoId,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: "2026-08-03",
      finalContrato: "2026-12-20",
    });
    await aprobarContrato({ actorUserId: ACTOR, contractId, classroomId });
    const persona = await queryOne<{ user_id: string | null }>(
      `SELECT user_id FROM people_person WHERE id = $1`,
      [ninoId],
    );
    ninoUserId = persona?.user_id ?? null;
  });

  afterAll(async () => {
    await execute(`DELETE FROM progression_award WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM progression_level_progress WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM assessment_attempt WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM attendance_attendance WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    if (ninoUserId !== null) await execute(`DELETE FROM identity_user WHERE id = $1`, [ninoUserId]);
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Prog${sufijo}`]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await closePool();
  });

  it("3 prácticas aprobadas + Level Up: el nivel NO se completa (faltan lecciones)", async () => {
    for (const quizId of practicas.slice(0, 3)) {
      await registrarIntento({ actorUserId: ACTOR, childPersonId: ninoId, quizId, score: 90 });
    }
    await registrarIntento({
      actorUserId: ACTOR,
      childPersonId: ninoId,
      quizId: levelUpRookie,
      score: 95,
    });
    const progreso = await progresoDeNino(ninoId);
    const rookie = progreso.niveles.find((n) => n.codigo === "ROOKIE");
    expect(rookie?.leccionesCompletadas).toBe(3);
    expect(rookie?.levelUpAprobado).toBe(true);
    expect(rookie?.estado).toBe("EN_CURSO");
    expect(rookie?.medalla).toBe(false);
  });

  it("la 4.ª práctica completa el nivel y otorga LA MEDALLA 🏅 automáticamente", async () => {
    const resultado = await registrarIntento({
      actorUserId: ACTOR,
      childPersonId: ninoId,
      quizId: practicas[3] as string,
      score: 88,
    });
    expect(resultado.progresion?.medallasNuevas).toBe(1);

    const progreso = await progresoDeNino(ninoId);
    const rookie = progreso.niveles.find((n) => n.codigo === "ROOKIE");
    expect(rookie?.estado).toBe("COMPLETADO");
    expect(rookie?.medalla).toBe(true);
    // El nivel siguiente sigue pendiente.
    expect(progreso.niveles.find((n) => n.codigo === "CHAMPION")?.estado).not.toBe("COMPLETADO");
    expect(progreso.diploma).toBe(false);
  });

  it("IDEMPOTENTE: recalcular de nuevo no duplica la medalla", async () => {
    await recalcularProgresion(ninoId);
    await recalcularProgresion(ninoId);
    const medallas = await queryRows<{ id: string }>(
      `SELECT id FROM progression_award WHERE child_person_id = $1 AND tipo = 'MEDALLA'`,
      [ninoId],
    );
    expect(medallas).toHaveLength(1);
  });

  it("RECUPERABLE (lección de LGS): estado borrado se re-deriva desde el camino de ASISTENCIA", async () => {
    // Simular el bug histórico: el estado de progresión se pierde.
    await execute(`DELETE FROM progression_level_progress WHERE child_person_id = $1`, [ninoId]);

    // El Guía marca asistencia (camino 1) → la función central re-deriva TODO.
    await marcarAsistencia({
      actorUserId: ACTOR,
      sessionId,
      marcas: [{ childPersonId: ninoId, estado: "PRESENTE" }],
    });

    const progreso = await progresoDeNino(ninoId);
    const rookie = progreso.niveles.find((n) => n.codigo === "ROOKIE");
    expect(rookie?.estado).toBe("COMPLETADO"); // recuperado sin intervención
    expect(rookie?.leccionesCompletadas).toBe(4);
  });

  it("el diploma NO llega hasta completar TODOS los niveles", async () => {
    // Champion solo con su Level Up (sin lecciones) no completa.
    await registrarIntento({
      actorUserId: ACTOR,
      childPersonId: ninoId,
      quizId: levelChampionUp,
      score: 100,
    });
    const progreso = await progresoDeNino(ninoId);
    expect(progreso.diploma).toBe(false);
  });
});
