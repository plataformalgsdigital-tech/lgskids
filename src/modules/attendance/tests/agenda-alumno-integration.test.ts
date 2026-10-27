import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { agendaProximas } from "../application/resumen-alumno";

/**
 * INTEGRACIÓN: la agenda del panel del niño (2026-10-27). La clase EN CURSO
 * sigue en la agenda hasta que termina: antes salía en cuanto empezaba y el niño
 * se quedaba sin el enlace de Zoom en plena clase (Elena Rosas, YOUNGSTER Salón
 * 06, la del 27-oct a las 19:00 de Chile no aparecía a las 19:56).
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

describe.runIf(RUN)("agenda del panel del alumno (integración)", () => {
  const campaignId = newId();
  const courseId = newId();
  const classroomId = newId();
  const terminada = newId();
  const enCurso = newId();
  const futura = newId();

  beforeAll(async () => {
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, current_date - 30, current_date + 60, current_date - 30, now())`,
      [campaignId, `IT Agenda ${campaignId.slice(0, 8)}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'YOUNGSTER', current_date - 30, current_date + 60, now())`,
      [courseId, campaignId],
    );
    await execute(
      `INSERT INTO scheduling_classroom (id, course_id, nombre, cupo, timezone, holiday_country, updated_at)
       VALUES ($1, $2, 'Agenda IT', 10, 'America/Santiago', 'CL', now())`,
      [classroomId, courseId],
    );
    // Eventos sueltos (sin slot) de 60 min: una terminada, una empezada hace 50
    // min (le quedan 10) y una de mañana.
    for (const [id, inicio, numero] of [
      [terminada, "now() - interval '2 hours'", 1],
      [enCurso, "now() - interval '50 minutes'", 2],
      [futura, "now() + interval '1 day'", 3],
    ] as const) {
      await execute(
        `INSERT INTO scheduling_session (id, classroom_id, tipo, fecha, starts_at, duracion_min, numero)
         VALUES ($1, $2, 'SESION', (${inicio})::date, ${inicio}, 60, $3)`,
        [id, classroomId, numero],
      );
    }
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await closePool();
  });

  it("la clase en curso es la próxima hasta que termina; la terminada no sale", async () => {
    const agenda = await agendaProximas(classroomId, 14);
    expect(agenda.map((e) => e.sessionId)).toEqual([enCurso, futura]);
  });
});
