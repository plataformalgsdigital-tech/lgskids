import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { crearSalon, editarSalon, regenerarSesiones } from "../application/gestion-salones";

/**
 * INTEGRACIÓN: un salón INACTIVO y sin niños no tiene clases agendadas
 * (2026-10-23). Desactivarlo le quita las sesiones FUTURAS de su horario (las
 * pasadas se quedan: son historia), regenerarlo mientras está inactivo no se las
 * devuelve, y reactivarlo las vuelve a agendar con la misma generación.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.runIf(RUN)("salón inactivo sin sesiones (integración)", () => {
  let actor: string;
  let campaignId: string;
  let classroomId: string;

  const contar = async () =>
    (await queryOne<{ pasadas: number; futuras: number }>(
      `SELECT count(*) FILTER (WHERE starts_at <= now())::int AS pasadas,
              count(*) FILTER (WHERE starts_at > now())::int AS futuras
         FROM scheduling_session WHERE classroom_id = $1 AND slot_id IS NOT NULL`,
      [classroomId],
    )) ?? { pasadas: 0, futuras: 0 };

  beforeAll(async () => {
    actor = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    campaignId = newId();
    const courseId = newId();
    // Ventana a caballo de hoy: hay sesiones dictadas y por venir.
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, $3, $4, $3, now())`,
      [campaignId, `IT Inactivo ${campaignId.slice(0, 8)}`, dias(-30), dias(60)],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', $3, $4, now())`,
      [courseId, campaignId, dias(-30), dias(60)],
    );
    classroomId = (
      await crearSalon({
        actorUserId: actor,
        courseId,
        nombre: `Salón Inactivo ${courseId.slice(0, 8)}`,
        cupo: 10,
        timezone: "America/Santiago",
        holidayCountry: "CL",
        slots: [
          { tipo: "SESION", diaSemana: 2, horaLocal: "17:00" },
          { tipo: "SESION", diaSemana: 4, horaLocal: "17:00" },
        ],
      })
    ).id;
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await closePool();
  });

  it("desactivar quita las futuras, regenerar no las devuelve y reactivar sí", async () => {
    const antes = await contar();
    expect(antes.pasadas).toBeGreaterThan(0);
    expect(antes.futuras).toBeGreaterThan(0);

    const off = await editarSalon({ actorUserId: actor, classroomId, activo: false });
    expect(off.ninos).toBe(0);
    expect(off.sesionesQuitadas).toBe(antes.futuras);
    expect(await contar()).toEqual({ pasadas: antes.pasadas, futuras: 0 });

    // Inactivo y vacío: regenerar (o mover el fin de la campaña) no lo vuelve a llenar.
    await regenerarSesiones({ actorUserId: actor, classroomId });
    expect(await contar()).toEqual({ pasadas: antes.pasadas, futuras: 0 });

    const on = await editarSalon({ actorUserId: actor, classroomId, activo: true });
    expect(on.sesionesCreadas).toBe(antes.futuras);
    expect(await contar()).toEqual(antes);
  });
});
