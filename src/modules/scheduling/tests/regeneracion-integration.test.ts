import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { cambiarGuia, crearSalon, regenerarSesiones } from "../application/gestion-salones";

/**
 * REGENERAR un salón de dos días por semana.
 *
 * Lo que se fija:
 *  - el NÚMERO es del curso, no del día: con dos slots el índice por slot daba
 *    dos "Sesión 1", dos "Sesión 2"… y en la pantalla parecían duplicadas;
 *  - regenerar no acumula: mismo conjunto de fechas, sin instantes repetidos;
 *  - asignar el guía a un salón que no tenía deja TODAS las sesiones con él
 *    (las heredan: `guia_user_id` de la sesión queda NULL a propósito, para
 *    que un cambio futuro pueda congelar lo ya dictado).
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 6);

describe.runIf(RUN)("regeneración de sesiones (integración)", () => {
  let campaignId: string;
  let courseId: string;
  let classroomId: string;
  let guiaId: string;

  interface Fila {
    numero: number;
    fecha: string;
    guia: string | null;
    startsAt: Date;
  }
  const sesiones = async (): Promise<Fila[]> =>
    queryRows<Fila>(
      `SELECT numero, fecha::text AS fecha, guia_user_id AS guia, starts_at AS "startsAt"
         FROM scheduling_session WHERE classroom_id = $1 ORDER BY starts_at`,
      [classroomId],
    );

  beforeAll(async () => {
    campaignId = newId();
    courseId = newId();
    guiaId = newId();
    await execute(
      `INSERT INTO identity_user (id, username, password_hash, updated_at)
       VALUES ($1, $2, 'x', now())`,
      [guiaId, `it-regen-${marca}`],
    );
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2026-08-03', '2026-11-30', '2026-08-24', now())`,
      [campaignId, `IT Regen ${marca}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-08-03', '2026-11-30', now())`,
      [courseId, campaignId],
    );
    // DOS días por semana: es el caso donde se veían los números repetidos.
    const salon = await crearSalon({
      actorUserId: ACTOR,
      courseId,
      nombre: `IT Regen ${marca}`,
      cupo: 10,
      timezone: "America/Santiago",
      holidayCountry: "CL",
      slots: [
        { tipo: "SESION", diaSemana: 1, horaLocal: "17:00" },
        { tipo: "SESION", diaSemana: 3, horaLocal: "17:00" },
      ],
    });
    classroomId = salon.id;
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await execute(`DELETE FROM identity_user WHERE id = $1`, [guiaId]);
    await closePool();
  });

  it("numera 1..N por el CURSO, sin repetir ni saltar", async () => {
    const filas = await sesiones();
    expect(filas.length).toBeGreaterThan(20);
    // Van en orden cronológico y sin huecos: 1, 2, 3… N.
    expect(filas.map((f) => f.numero)).toEqual(filas.map((_, i) => i + 1));
    expect(new Set(filas.map((f) => f.numero)).size).toBe(filas.length);
  });

  it("regenerar deja el MISMO conjunto, sin sesiones dobles", async () => {
    const antes = await sesiones();
    const r = await regenerarSesiones({ actorUserId: ACTOR, classroomId });
    expect(r.sesiones).toBe(antes.length);

    const despues = await sesiones();
    expect(despues.map((f) => f.fecha)).toEqual(antes.map((f) => f.fecha));
    expect(despues.map((f) => f.numero)).toEqual(antes.map((f) => f.numero));
    // Ni un instante repetido (el índice único lo impide, y aquí se afirma).
    const instantes = despues.map((f) => f.startsAt.getTime());
    expect(new Set(instantes).size).toBe(instantes.length);
  });

  it("asignar el guía al salón lo deja en TODAS sus sesiones", async () => {
    await cambiarGuia({ actorUserId: ACTOR, classroomId, guiaUserId: guiaId });
    // Ninguna queda con guía propio: todas heredan el del salón, que es el
    // guía nuevo. Así un cambio POSTERIOR sí puede congelar lo ya dictado.
    const filas = await sesiones();
    expect(filas.every((f) => f.guia === null)).toBe(true);

    const efectivo = await queryRows<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling_session s
         JOIN scheduling_classroom cl ON cl.id = s.classroom_id
        WHERE s.classroom_id = $1 AND COALESCE(s.guia_user_id, cl.guia_user_id) = $2`,
      [classroomId, guiaId],
    );
    expect(efectivo[0]?.n).toBe(filas.length);
  });
});
