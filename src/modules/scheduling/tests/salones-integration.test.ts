import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import {
  crearSalon,
  detalleSalon,
  regenerarSesiones,
  suspenderDia,
} from "../application/gestion-salones";

/**
 * INTEGRACIÓN: salón real sobre un curso real, generación completa,
 * suspensión con corrimiento y regeneración idempotente — todo contra
 * Postgres. Requiere INTEGRATION_TESTS=1 y migraciones aplicadas.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

const ACTOR = "00000000-0000-0000-0000-000000000000";

describe.runIf(RUN)("salones (integración)", () => {
  let campaignId: string;
  let courseId: string;
  let classroomId: string;

  beforeAll(async () => {
    // Curso directo en BD: ventana de 12 semanas (lunes 3/8 a domingo 25/10).
    campaignId = newId();
    courseId = newId();
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, updated_at)
       VALUES ($1, $2, '2026-08-03', '2026-10-25', now())`,
      [campaignId, `IT Sched ${campaignId.slice(0, 8)}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-08-03', '2026-10-25', now())`,
      [courseId, campaignId],
    );
  });

  afterAll(async () => {
    if (classroomId !== undefined) {
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    }
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await closePool();
  });

  it("crear salón genera sesiones + clubs con feriados EN TABLA aplicados", async () => {
    const resultado = await crearSalon({
      actorUserId: ACTOR,
      courseId,
      nombre: "Salón Rookie A",
      cupo: 12,
      meetingUrl: "https://meet.example.com/rookie-a",
      timezone: "America/Santiago",
      holidayCountry: "CL",
      slots: [
        { tipo: "SESION", diaSemana: 2, horaLocal: "18:00" }, // martes
        { tipo: "SESION", diaSemana: 4, horaLocal: "18:00" }, // jueves
        { tipo: "CLUB", diaSemana: 6, horaLocal: "10:00" }, // sábado
      ],
    });
    classroomId = resultado.id;
    // 12 martes + 12 jueves + 12 sábados = 36.
    expect(resultado.sesionesGeneradas).toBe(36);

    const detalle = await detalleSalon(classroomId);
    // Sábados feriados en CL 2026 dentro/tras la ventana: 15/8 (Asunción),
    // 19/9 (Glorias del Ejército) y 31/10 (Iglesias Evangélicas). Los tres
    // se saltan y las sesiones se corren al final conservando el total.
    const fechasClub = detalle.sesiones.filter((s) => s.tipo === "CLUB").map((s) => s.fecha);
    expect(fechasClub).not.toContain("2026-08-15");
    expect(fechasClub).not.toContain("2026-09-19");
    expect(fechasClub).not.toContain("2026-10-31");
    expect(fechasClub).toHaveLength(12);
    expect(fechasClub.at(-1)).toBe("2026-11-14"); // 12º club: 3 corrimientos tras el fin nominal
  });

  it("los instantes UTC respetan el horario de verano chileno (DST)", async () => {
    const detalle = await detalleSalon(classroomId);
    const martes = detalle.sesiones.filter(
      (s) => s.tipo === "SESION" && s.fecha.startsWith("2026-08"),
    );
    const septiembreTarde = detalle.sesiones.find((s) => s.fecha === "2026-10-20");
    // Agosto (invierno chileno, UTC-4): 18:00 → 22:00Z.
    expect(martes[0]?.startsAt.toISOString()).toContain("T22:00:00");
    // Octubre tras el cambio (verano, UTC-3): 18:00 → 21:00Z.
    expect(septiembreTarde?.startsAt.toISOString()).toContain("T21:00:00");
  });

  it("suspender un día corre ESA sesión al final conservando el total", async () => {
    const antes = await detalleSalon(classroomId);
    const martesAntes = antes.sesiones.filter((s) => s.fecha === "2026-08-11");
    expect(martesAntes).toHaveLength(1);

    await suspenderDia({
      actorUserId: ACTOR,
      classroomId,
      fecha: "2026-08-11",
      motivo: "corte de luz programado",
    });

    const despues = await detalleSalon(classroomId);
    expect(despues.sesiones).toHaveLength(36); // total intacto
    expect(despues.sesiones.some((s) => s.fecha === "2026-08-11")).toBe(false);
    expect(despues.suspensiones).toContain("2026-08-11");
  });

  it("regenerar N veces produce EXACTAMENTE el mismo conjunto (la suspensión persiste)", async () => {
    const referencia = (await detalleSalon(classroomId)).sesiones.map(
      (s) => `${s.tipo}|${s.fecha}|${s.numero}`,
    );
    for (let i = 0; i < 3; i += 1) {
      await regenerarSesiones({ actorUserId: ACTOR, classroomId });
      const actual = (await detalleSalon(classroomId)).sesiones.map(
        (s) => `${s.tipo}|${s.fecha}|${s.numero}`,
      );
      expect(actual).toEqual(referencia);
    }
    // Y finalCurso del curso NO cambió (regla de oro).
    const curso = await queryOne<{ final_curso: string }>(
      `SELECT final_curso::text FROM catalog_course WHERE id = $1`,
      [courseId],
    );
    expect(curso?.final_curso).toBe("2026-10-25");
  });

  it("el fin REAL del curso es la última sesión, posterior al final nominal", async () => {
    const detalle = await detalleSalon(classroomId);
    expect(detalle.finReal).not.toBeNull();
    expect(detalle.finReal! > "2026-10-25").toBe(true);
  });

  it("los feriados quedaron materializados en tabla (país del salón)", async () => {
    const feriados = await queryRows<{ fecha: string }>(
      `SELECT fecha::text AS fecha FROM scheduling_holiday WHERE country_code = 'CL' AND fecha BETWEEN '2026-01-01' AND '2026-12-31'`,
    );
    expect(feriados.length).toBeGreaterThan(10);
  });
});
