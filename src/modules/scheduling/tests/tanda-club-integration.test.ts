import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { crearEvento, editarEvento } from "../application/crear-evento";
import { crearSalon } from "../application/gestion-salones";

/**
 * INTEGRACIÓN: TANDA DE CLUBS (2026-10-23). Un Club que se repite cada semana
 * entre el inicio y el final de la tanda:
 *  - cada semana es UNA clase (un instante) compartida por los salones;
 *  - el feriado de un salón se salta solo para ese salón (Reyes, 11-ene-2027,
 *    es feriado en Colombia y no en Chile);
 *  - editar "toda la tanda" corre todas las semanas futuras los mismos días;
 *  - un choque con algo ya agendado no deja crear nada.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

describe.runIf(RUN)("tanda de clubs (integración)", () => {
  let actor: string;
  let campaignId: string;
  let chile: string;
  let colombia: string;

  const sesionesDeTanda = (tandaId: string) =>
    queryRows<{ salon: string; fecha: string; startsAt: Date; grupoId: string | null }>(
      `SELECT cl.nombre AS salon, s.fecha::text AS fecha, s.starts_at AS "startsAt",
              s.grupo_id AS "grupoId"
         FROM scheduling_session s JOIN scheduling_classroom cl ON cl.id = s.classroom_id
        WHERE s.tanda_id = $1 ORDER BY s.starts_at, cl.nombre`,
      [tandaId],
    );

  beforeAll(async () => {
    actor = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    campaignId = newId();
    const courseId = newId();
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2026-10-01', '2027-03-01', '2026-10-01', now())`,
      [campaignId, `IT Tanda ${campaignId.slice(0, 8)}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-10-01', '2027-03-01', now())`,
      [courseId, campaignId],
    );
    const salon = async (nombre: string, timezone: string, pais: string) =>
      (
        await crearSalon({
          actorUserId: actor,
          courseId,
          nombre: `${nombre} ${courseId.slice(0, 8)}`,
          cupo: 10,
          timezone,
          holidayCountry: pais,
          slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00" }],
        })
      ).id;
    chile = await salon("Tanda CL", "America/Santiago", "CL");
    colombia = await salon("Tanda CO", "America/Bogota", "CO");
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_classroom WHERE id = ANY($1)`, [[chile, colombia]]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await execute(
      `DELETE FROM scheduling_tanda_club t WHERE NOT EXISTS
         (SELECT 1 FROM scheduling_session s WHERE s.tanda_id = t.id) AND t.creado_por = $1
         AND t.inicio = '2027-01-04'`,
      [actor],
    );
    await closePool();
  });

  it("crea una clase por semana, salta el feriado de cada salón y se edita entera", async () => {
    const creado = await crearEvento({
      actorUserId: actor,
      classroomIds: [chile, colombia],
      tipo: "CLUB",
      fecha: "2027-01-04", // lunes
      horaLocal: "15:00",
      duracionMin: 60,
      guiaUserId: actor,
      zona: "America/Bogota",
      tanda: { inicio: "2027-01-04", fin: "2027-01-18" },
    });
    expect(creado.tandaId).not.toBeNull();
    let filas = await sesionesDeTanda(creado.tandaId ?? "");
    // 3 lunes en Chile y 2 en Colombia (el 11 es Reyes allá).
    expect(filas.filter((f) => f.salon.startsWith("Tanda CL"))).toHaveLength(3);
    expect(filas.filter((f) => f.salon.startsWith("Tanda CO")).map((f) => f.fecha)).toEqual([
      "2027-01-04",
      "2027-01-18",
    ]);
    // Cada semana es UN instante compartido (mismo grupo en los dos salones).
    const semana1 = filas.filter((f) => f.fecha === "2027-01-04");
    expect(new Set(semana1.map((f) => f.startsAt.getTime())).size).toBe(1);
    expect(new Set(semana1.map((f) => f.grupoId)).size).toBe(1);

    // Editar TODA la tanda: un día después y a otra hora; todas se corren.
    const primera = await queryOne<{ id: string }>(
      `SELECT id FROM scheduling_session WHERE tanda_id = $1 AND classroom_id = $2
        ORDER BY starts_at LIMIT 1`,
      [creado.tandaId, colombia],
    );
    const r = await editarEvento({
      actorUserId: actor,
      sessionId: primera?.id ?? "",
      tipo: "CLUB",
      fecha: "2027-01-05",
      horaLocal: "16:00",
      duracionMin: 60,
      guiaUserId: actor,
      todaLaTanda: true,
    });
    expect(r.sesiones).toBe(5);
    filas = await sesionesDeTanda(creado.tandaId ?? "");
    expect([...new Set(filas.map((f) => f.fecha))]).toEqual([
      "2027-01-05",
      "2027-01-12",
      "2027-01-19",
    ]);
    const tanda = await queryOne<{ inicio: string; fin: string }>(
      `SELECT inicio::text, fin::text FROM scheduling_tanda_club WHERE id = $1`,
      [creado.tandaId],
    );
    expect(tanda).toEqual({ inicio: "2027-01-05", fin: "2027-01-19" });
  });

  it("un choque no crea nada y la fecha fuera de la tanda se rechaza", async () => {
    const base = {
      actorUserId: actor,
      classroomIds: [chile],
      tipo: "CLUB" as const,
      horaLocal: "10:00",
      duracionMin: 60,
      guiaUserId: actor,
    };
    await crearEvento({ ...base, fecha: "2027-02-10" }); // un club suelto el miércoles 10
    await expect(
      crearEvento({
        ...base,
        fecha: "2027-02-03",
        tanda: { inicio: "2027-02-01", fin: "2027-02-20" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const sobrantes = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling_session
        WHERE classroom_id = $1 AND tanda_id IS NOT NULL AND fecha BETWEEN '2027-02-01' AND '2027-02-20'`,
      [chile],
    );
    expect(sobrantes?.n).toBe(0);
    await expect(
      crearEvento({
        ...base,
        fecha: "2027-03-03",
        tanda: { inicio: "2027-02-01", fin: "2027-02-20" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
