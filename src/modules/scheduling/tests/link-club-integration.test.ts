import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { crearEvento, editarEvento } from "../application/crear-evento";
import { crearSalon } from "../application/gestion-salones";
import { crearLinkClub, editarLinkClub, eliminarLinkClub } from "../application/link-club";
import { detalleSesion } from "../infrastructure/scheduling-repository";

/**
 * INTEGRACIÓN: LINKS DE CLUBES (2026-10-28). Un Club con "Link diferente al del
 * Advisor" toma su enlace de la tabla, y solo de un link del MISMO día de la
 * semana; el link manda sobre la sala del guía en la lectura de la sesión; un
 * link en uso no se borra ni cambia de día.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

describe.runIf(RUN)("links de clubes (integración)", () => {
  let actor: string;
  let campaignId: string;
  let salon: string;
  let viernes: string;
  let sabado: string;
  const URL_VIERNES = `https://zoom.us/j/9${Date.now().toString().slice(-9)}`;

  beforeAll(async () => {
    actor = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    campaignId = newId();
    const courseId = newId();
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2027-01-01', '2027-06-01', '2027-01-01', now())`,
      [campaignId, `IT Links ${campaignId.slice(0, 8)}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2027-01-01', '2027-06-01', now())`,
      [courseId, campaignId],
    );
    salon = (
      await crearSalon({
        actorUserId: actor,
        courseId,
        nombre: `Links ${courseId.slice(0, 8)}`,
        cupo: 10,
        timezone: "America/Santiago",
        holidayCountry: "CL",
        slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00" }],
      })
    ).id;
    viernes = (
      await crearLinkClub({
        actorUserId: actor,
        nombre: "IT Club viernes",
        diaSemana: 5,
        horario: "16:00 - 17:00",
        link: URL_VIERNES,
      })
    ).id;
    sabado = (
      await crearLinkClub({
        actorUserId: actor,
        nombre: "IT Club sábado",
        diaSemana: 6,
        horario: "10:00 - 11:00",
        link: "https://zoom.us/j/111",
      })
    ).id;
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [salon]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await execute(`DELETE FROM scheduling_link_club WHERE id = ANY($1)`, [[viernes, sabado]]);
    await closePool();
  });

  it("el Club toma el link del día, que manda sobre la sala del guía", async () => {
    const base = {
      actorUserId: actor,
      classroomIds: [salon],
      tipo: "CLUB" as const,
      fecha: "2027-02-05", // viernes
      horaLocal: "16:00",
      duracionMin: 60,
      guiaUserId: actor,
    };
    // Un link de sábado no sirve para un viernes, y solo un Club lleva link.
    await expect(crearEvento({ ...base, linkClubId: sabado })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      crearEvento({ ...base, tipo: "TALLER", linkClubId: viernes }),
    ).rejects.toBeInstanceOf(ValidationError);

    const creado = await crearEvento({ ...base, linkClubId: viernes });
    const id = creado.sesiones[0]?.id ?? "";
    expect((await detalleSesion(id))?.salon.meetingUrl).toBe(URL_VIERNES);

    // En uso: no se borra ni cambia de día; corregir el enlace lo corrige en la sesión.
    await expect(eliminarLinkClub({ id: viernes, actorUserId: actor })).rejects.toBeInstanceOf(
      ConflictError,
    );
    const datos = {
      id: viernes,
      actorUserId: actor,
      nombre: "IT Club viernes",
      horario: "16:00 - 17:00",
      activo: true,
    };
    await expect(
      editarLinkClub({ ...datos, diaSemana: 6, link: URL_VIERNES }),
    ).rejects.toBeInstanceOf(ConflictError);
    await editarLinkClub({ ...datos, diaSemana: 5, link: `${URL_VIERNES}1` });
    expect((await detalleSesion(id))?.salon.meetingUrl).toBe(`${URL_VIERNES}1`);

    // Editar el Club con link null lo devuelve a la sala del advisor.
    await editarEvento({
      actorUserId: actor,
      sessionId: id,
      tipo: "CLUB",
      fecha: "2027-02-05",
      horaLocal: "16:00",
      duracionMin: 60,
      guiaUserId: actor,
      linkClubId: null,
    });
    expect((await detalleSesion(id))?.salon.meetingUrl).not.toBe(`${URL_VIERNES}1`);

    // Sin uso, se borra.
    await eliminarLinkClub({ id: sabado, actorUserId: actor });
    sabado = viernes;
  });
});
