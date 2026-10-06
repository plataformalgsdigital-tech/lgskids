import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError } from "@/platform/errors";
import { agregarSalonDesdeCatalogo } from "../application/gestion-salones";
import { crearHorario, eliminarHorario } from "../application/horarios-catalogo";

/**
 * "+ Agregar salón" en la ficha de la campaña (2026-10-06): era un enlace al
 * calendario que no creaba nada. Ahora crea UN salón desde un horario del
 * catálogo, con las mismas reglas que "Generar salones del catálogo".
 *
 * El horario es propio de la prueba (salón "97"): ninguna otra prueba lee el
 * catálogo, y en la base vacía de CI no hay ninguno.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 6);
const hoy = new Date().toISOString().slice(0, 10);

describe.runIf(RUN)("agregar un salón desde el catálogo (integración)", () => {
  let campaniaId: string;
  let horarioId: string;
  let classroomId: string;

  beforeAll(async () => {
    campaniaId = (
      await crearCampania({
        actorUserId: ACTOR,
        nombre: `Agregar salon ${marca}`,
        inicio: hoy,
        cursoInicio: hoy,
      })
    ).id;
    horarioId = (
      await crearHorario({
        actorUserId: ACTOR,
        tipoCurso: "YOUNGSTER",
        grupoPais: "02",
        salonNumero: "97",
        etiqueta: `Prueba ${marca}`,
        slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "18:00", duracionMin: 60 }],
      })
    ).id;
  });

  afterAll(async () => {
    if (classroomId !== undefined) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [classroomId]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    }
    await eliminarHorario({ actorUserId: ACTOR, horarioId });
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("crea el salón del horario en el curso que le toca, con su país y sus sesiones", async () => {
    const r = await agregarSalonDesdeCatalogo({
      actorUserId: ACTOR,
      campaignId: campaniaId,
      horarioId,
      cupo: 8,
    });
    classroomId = r.id;
    expect(r.nombre).toBe("YOUNGSTER Salón 97");
    expect(r.sesionesGeneradas).toBeGreaterThan(0);

    const salon = await queryOne<{
      tipo: string;
      cupo: number;
      timezone: string;
      pais: string;
      guia: string | null;
    }>(
      `SELECT co.tipo::text AS tipo, cl.cupo, cl.timezone, cl.holiday_country AS pais,
              cl.guia_user_id AS guia
         FROM scheduling_classroom cl JOIN catalog_course co ON co.id = cl.course_id
        WHERE cl.id = $1`,
      [r.id],
    );
    expect(salon).toEqual({
      tipo: "YOUNGSTER",
      cupo: 8,
      timezone: "America/Bogota",
      pais: "CO",
      guia: null,
    });
  });

  it("tampoco lo duplica si el salón tiene el nombre corto del asistente", async () => {
    // El asistente de campaña nombra "Salón 97"; el catálogo, "YOUNGSTER Salón 97".
    // Son el mismo salón: comparar solo el nombre largo lo duplicaba.
    await execute(`UPDATE scheduling_classroom SET nombre = 'Salón 97' WHERE id = $1`, [
      classroomId,
    ]);
    await expect(
      agregarSalonDesdeCatalogo({ actorUserId: ACTOR, campaignId: campaniaId, horarioId }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("no lo duplica: si ya está en la campaña, lo dice", async () => {
    await expect(
      agregarSalonDesdeCatalogo({ actorUserId: ACTOR, campaignId: campaniaId, horarioId }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
