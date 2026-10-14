import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { calcularGuiaMes } from "@/modules/reporting";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, ForbiddenError } from "@/platform/errors";
import {
  avisarCancelacion,
  cancelacionDeSesion,
  cancelarPorGuia,
  resolverCancelacion,
} from "../application/cancelacion";
import { crearSalon } from "../application/gestion-salones";
import { cerrarSesion } from "../application/registro-sesion";
import { sesionesServicio } from "../application/servicio";

/**
 * CANCELACIÓN POR EL GUÍA (2026-10-14), como la definió el negocio: el guía
 * AVISA, administración CANCELA (y cuenta en las horas del guía), y puede
 * cubrirla con otro guía SOLO esa sesión. Y Servicio › Sesiones lo muestra.
 *
 * Los actores son cuentas reales: `guia_user_id`, `solicitada_por` y
 * `resuelta_por` son claves foráneas.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.runIf(RUN)("cancelación de sesión por el guía (integración)", () => {
  let guia: string;
  let otro: string;
  let campaniaId: string;
  let salon: string;
  let sesiones: { id: string; fecha: string; periodo: string }[] = [];

  beforeAll(async () => {
    guia = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    otro = (
      await queryOne<{ id: string }>(
        `SELECT id FROM identity_user WHERE estado = 'ACTIVO' AND id <> $1 ORDER BY created_at LIMIT 1`,
        [guia],
      )
    )?.id as string;
    campaniaId = (
      await crearCampania({
        actorUserId: guia,
        nombre: `Cancelación ${marca}`,
        inicio: dias(0),
        cursoInicio: dias(7),
      })
    ).id;
    const curso = await queryOne<{ id: string }>(
      `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
      [campaniaId],
    );
    salon = (
      await crearSalon({
        actorUserId: guia,
        courseId: curso?.id ?? "",
        nombre: `Cancelación Jr ${marca}`,
        guiaUserId: guia,
        cupo: 5,
        timezone: "America/Bogota",
        holidayCountry: "CO",
        slots: [{ tipo: "SESION", diaSemana: 3, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    sesiones = await queryRows<{ id: string; fecha: string; periodo: string }>(
      `SELECT s.id, s.fecha::text AS fecha,
              to_char(s.starts_at AT TIME ZONE 'America/Bogota', 'YYYY-MM') AS periodo
         FROM scheduling_session s WHERE s.classroom_id = $1 ORDER BY s.starts_at LIMIT 4`,
      [salon],
    );
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_cancelacion WHERE classroom_id = $1`, [salon]);
    await execute(`DELETE FROM scheduling_suspension WHERE classroom_id = $1`, [salon]);
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [salon]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [salon]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [salon]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("solo el guía de la sesión avisa (o coordinación), y una vez", async () => {
    const [s] = sesiones;
    await expect(
      avisarCancelacion({
        actorUserId: otro,
        sessionId: s?.id as string,
        motivo: "No es mi sesión",
        puedeGestionar: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await avisarCancelacion({
      actorUserId: guia,
      sessionId: s?.id as string,
      motivo: "Cita médica",
      puedeGestionar: false,
    });
    await expect(
      avisarCancelacion({
        actorUserId: guia,
        sessionId: s?.id as string,
        motivo: "Otra vez",
        puedeGestionar: false,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await cancelacionDeSesion(s?.id as string))?.estado).toBe("PENDIENTE");
  });

  it("aprobada sin reemplazo: no se registra, cuenta en las horas del guía y Servicio la ve CANCELADA", async () => {
    const [s] = sesiones;
    const c = await cancelacionDeSesion(s?.id as string);
    await resolverCancelacion({ actorUserId: otro, cancelacionId: c?.id as string, aprobar: true });
    await expect(
      cerrarSesion({ actorUserId: guia, sessionId: s?.id as string, horaReal: "17:00" }),
    ).rejects.toBeInstanceOf(ConflictError);

    const horas = (await calcularGuiaMes(s?.periodo as string)).find((g) => g.guiaUserId === guia);
    expect(horas?.sesionesCanceladas).toBeGreaterThanOrEqual(1);

    const vista = await sesionesServicio({
      countryScope: null,
      desde: s?.fecha as string,
      hasta: s?.fecha as string,
      classroomId: salon,
    });
    expect(vista.find((v) => v.sessionId === s?.id)?.estado).toBe("CANCELADA");
  });

  it("cubierta por otro guía: SOLO esa sesión cambia de guía", async () => {
    const [, s2, s3] = sesiones;
    const c = await cancelarPorGuia({
      actorUserId: otro,
      sessionId: s2?.id as string,
      motivo: "Viaje del guía",
      reemplazoGuiaUserId: otro,
    });
    expect(c.estado).toBe("APROBADA");
    expect(c.reemplazo).not.toBeNull();
    const guias = await queryRows<{ id: string; guia: string | null }>(
      `SELECT id, guia_user_id AS guia FROM scheduling_session WHERE id = ANY($1)`,
      [[s2?.id, s3?.id]],
    );
    expect(guias.find((g) => g.id === s2?.id)?.guia).toBe(otro);
    // La siguiente sigue heredando el guía del salón.
    expect(guias.find((g) => g.id === s3?.id)?.guia).toBeNull();

    const vista = await sesionesServicio({
      countryScope: null,
      desde: s2?.fecha as string,
      hasta: s2?.fecha as string,
      classroomId: salon,
    });
    const fila = vista.find((v) => v.sessionId === s2?.id);
    expect(fila?.estado).not.toBe("CANCELADA");
    expect(fila?.cubiertaPor).not.toBeNull();
  });

  it("rechazada: la sesión sigue con su guía y se puede volver a avisar", async () => {
    const [, , s3] = sesiones;
    const { id } = await avisarCancelacion({
      actorUserId: guia,
      sessionId: s3?.id as string,
      motivo: "Quizás no pueda",
      puedeGestionar: false,
    });
    await resolverCancelacion({ actorUserId: otro, cancelacionId: id, aprobar: false });
    expect((await cancelacionDeSesion(s3?.id as string))?.estado).toBe("RECHAZADA");
    await expect(
      resolverCancelacion({ actorUserId: otro, cancelacionId: id, aprobar: true }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("Servicio › Sesiones muestra el día SUSPENDIDO, que ya no tiene sesión", async () => {
    const fecha = dias(60);
    await execute(
      `INSERT INTO scheduling_suspension (id, classroom_id, fecha, motivo)
       VALUES ($1, $2, $3::date, 'Feriado local')`,
      [randomUUID(), salon, fecha],
    );
    const vista = await sesionesServicio({
      countryScope: null,
      desde: fecha,
      hasta: fecha,
      classroomId: salon,
      estado: "SUSPENDIDA",
    });
    expect(vista).toHaveLength(1);
    expect(vista[0]?.detalle).toBe("Feriado local");
    expect(vista[0]?.sessionId).toBeNull();
    // Y el alcance por país del salón (CO) deja fuera a quien solo ve Chile.
    expect(
      await sesionesServicio({
        countryScope: ["CL"],
        desde: fecha,
        hasta: fecha,
        classroomId: salon,
      }),
    ).toHaveLength(0);
  });
});
