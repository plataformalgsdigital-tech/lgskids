import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { ValidationError } from "@/platform/errors";
import { crearNino } from "@/modules/people";
import { aprobarContrato, crearContrato } from "@/modules/contracts";
import { registrarIntento } from "@/modules/assessment";
import { listaDeSesion, marcarAsistencia } from "../application/asistencia";

/**
 * INTEGRACIÓN Fase 8: lista derivada con aviso de feriado del país del niño,
 * marcado masivo con upsert, justificación obligatoria, e intentos de
 * cuestionario con umbral. Requiere INTEGRATION_TESTS=1 + seed.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const sufijo = Math.random().toString(36).slice(2, 8);

describe.runIf(RUN)("asistencia y cuestionarios (integración)", () => {
  let campaignId: string;
  let courseId: string;
  let classroomId: string;
  let sessionId: string;
  let ninoId: string;
  let ninoUserId: string | null = null;
  let quizPracticaId: string;
  let quizLevelUpId: string;
  let contractId: string;

  beforeAll(async () => {
    campaignId = newId();
    courseId = newId();
    classroomId = newId();
    sessionId = newId();
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2026-08-03', '2026-10-25',
               ('2026-08-03'::date + INTERVAL '21 days')::date, now())`,
      [campaignId, `IT Att ${sufijo}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-08-03', '2026-10-25', now())`,
      [courseId, campaignId],
    );
    // Nivel + lección + quizzes mínimos.
    const levelId = newId();
    const lessonId = newId();
    quizPracticaId = newId();
    quizLevelUpId = newId();
    await execute(
      `INSERT INTO catalog_level (id, course_id, codigo, orden, nombre) VALUES ($1, $2, 'ROOKIE', 1, 'Rookie')`,
      [levelId, courseId],
    );
    await execute(
      `INSERT INTO catalog_lesson (id, level_id, orden, titulo) VALUES ($1, $2, 1, 'Lección 1')`,
      [lessonId, levelId],
    );
    await execute(
      `INSERT INTO catalog_quiz (id, level_id, lesson_id, tipo, titulo) VALUES ($1, $2, $3, 'PRACTICA', 'Práctica 1')`,
      [quizPracticaId, levelId, lessonId],
    );
    await execute(
      `INSERT INTO catalog_quiz (id, level_id, lesson_id, tipo, titulo) VALUES ($1, $2, NULL, 'LEVEL_UP', 'Level Up Rookie')`,
      [quizLevelUpId, levelId],
    );
    // Salón con calendario CL y una sesión el 2026-08-07 (feriado en CO:
    // Batalla de Boyacá — insertamos el feriado CO para el aviso).
    await execute(
      `INSERT INTO scheduling_classroom (id, course_id, nombre, cupo, timezone, holiday_country, updated_at)
       VALUES ($1, $2, 'Att A', 10, 'America/Santiago', 'CL', now())`,
      [classroomId, courseId],
    );
    const slotId = newId();
    await execute(
      `INSERT INTO scheduling_slot (id, classroom_id, tipo, dia_semana, hora_local)
       VALUES ($1, $2, 'SESION', 5, '18:00')`,
      [slotId, classroomId],
    );
    await execute(
      `INSERT INTO scheduling_session (id, classroom_id, slot_id, tipo, fecha, starts_at, duracion_min, numero)
       VALUES ($1, $2, $3, 'SESION', '2026-08-07', '2026-08-07 22:00:00+00', 60, 1)`,
      [sessionId, classroomId, slotId],
    );
    await execute(
      `INSERT INTO scheduling_holiday (country_code, fecha, nombre, fuente)
       VALUES ('CO', '2026-08-07', 'Batalla de Boyacá', 'codigo')
       ON CONFLICT DO NOTHING`,
      [],
    );
    // Niño colombiano matriculado (contrato CO aprobado con salón).
    const creado = await crearNino({
      actorUserId: ACTOR,
      nino: {
        nombres: "Sara",
        apellidos: `Att${sufijo}`,
        fechaNacimiento: "2018-03-10",
        docTipo: "TI",
        docNumero: `AT-${sufijo}`,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: "Luisa",
        apellidos: `Att${sufijo}`,
        docTipo: "CC",
        docNumero: `AT-${sufijo}-A`,
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
    await execute(`DELETE FROM attendance_attendance WHERE session_id = $1`, [sessionId]);
    await execute(`DELETE FROM assessment_attempt WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    if (ninoUserId !== null) {
      await execute(`DELETE FROM identity_user WHERE id = $1`, [ninoUserId]);
    }
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Att${sufijo}`]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await closePool();
  });

  it("la lista deriva del salón y AVISA el feriado del país del niño (política documentada)", async () => {
    const { sesion, lista } = await listaDeSesion(sessionId);
    expect(sesion.salon).toBe("Att A");
    expect(lista).toHaveLength(1);
    // La sesión SÍ se dicta (7/8 no es feriado CL) pero Sara es de CO,
    // donde ES feriado → aviso para justificar.
    expect(lista[0]?.paisContrato).toBe("CO");
    expect(lista[0]?.feriadoEnSuPais).toBe(true);
    expect(lista[0]?.marca).toBeNull();
  });

  it("JUSTIFICADO sin justificación es rechazado", async () => {
    await expect(
      marcarAsistencia({
        actorUserId: ACTOR,
        sessionId,
        marcas: [{ childPersonId: ninoId, estado: "JUSTIFICADO" }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("marca, re-marca (upsert) y persiste la justificación", async () => {
    await marcarAsistencia({
      actorUserId: ACTOR,
      sessionId,
      marcas: [{ childPersonId: ninoId, estado: "AUSENTE" }],
    });
    // El guía se entera del feriado y corrige a JUSTIFICADO.
    await marcarAsistencia({
      actorUserId: ACTOR,
      sessionId,
      marcas: [
        {
          childPersonId: ninoId,
          estado: "JUSTIFICADO",
          justificacion: "feriado local: Batalla de Boyacá",
        },
      ],
    });
    const { lista } = await listaDeSesion(sessionId);
    expect(lista[0]?.marca?.estado).toBe("JUSTIFICADO");
    expect(lista[0]?.marca?.justificacion).toContain("Boyacá");
    // Solo UNA fila (upsert, no duplicados).
    const total = await queryOne<{ total: string }>(
      `SELECT count(*)::text AS total FROM attendance_attendance WHERE session_id = $1`,
      [sessionId],
    );
    expect(total?.total).toBe("1");
  });

  it("un niño ajeno al salón es rechazado", async () => {
    await expect(
      marcarAsistencia({
        actorUserId: ACTOR,
        sessionId,
        marcas: [{ childPersonId: newId(), estado: "PRESENTE" }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("cuestionario: 65 no aprueba, 85 aprueba; Level Up aprobado se registra", async () => {
    const bajo = await registrarIntento({
      actorUserId: ACTOR,
      childPersonId: ninoId,
      quizId: quizPracticaId,
      score: 65,
    });
    expect(bajo.aprobado).toBe(false);

    const alto = await registrarIntento({
      actorUserId: ACTOR,
      childPersonId: ninoId,
      quizId: quizPracticaId,
      score: 85,
    });
    expect(alto.aprobado).toBe(true);

    const levelUp = await registrarIntento({
      actorUserId: ACTOR,
      childPersonId: ninoId,
      quizId: quizLevelUpId,
      score: 90,
    });
    expect(levelUp.aprobado).toBe(true);
    expect(levelUp.tipo).toBe("LEVEL_UP");
  });

  it("no se registra intento de un niño sin matrícula en el curso", async () => {
    await expect(
      registrarIntento({
        actorUserId: ACTOR,
        childPersonId: newId(),
        quizId: quizPracticaId,
        score: 80,
      }),
    ).rejects.toThrow();
  });
});
