import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearSalon, matriculasDeCampania } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError } from "@/platform/errors";
import { crearCampania } from "../application/crear-campania";
import { actualizarFechasCampania, eliminarCampania } from "../application/editar-campania";

/**
 * EDITAR y BORRAR una campaña.
 *
 * Lo que se fija:
 *  - editar el nombre y el inicio comercial NO toca las sesiones: mover la
 *    ventana del programa es otra operación, con su previo y su bloqueo;
 *  - borrar se lleva los SALONES. `scheduling_classroom` no tiene clave foránea
 *    contra `catalog_course`, así que borrar la campaña sola los dejaría
 *    apuntando a un curso inexistente — el fallo silencioso que esto evita;
 *  - con matrículas NO se borra: ahí hay niños con contrato y progreso.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 6);

describe.runIf(RUN)("editar y borrar campaña (integración)", () => {
  let campaignId: string;
  let classroomId: string;
  const hoy = new Date().toISOString().slice(0, 10);

  const sesiones = async (): Promise<number> =>
    (
      await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM scheduling_session WHERE classroom_id = $1`,
        [classroomId],
      )
    )?.n ?? 0;

  beforeAll(async () => {
    const campania = await crearCampania({
      actorUserId: ACTOR,
      nombre: `IT Editar ${marca}`,
      inicio: hoy,
      cursoInicio: hoy,
    });
    campaignId = campania.id;
    const curso = await queryOne<{ id: string }>(
      `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
      [campaignId],
    );
    const salon = await crearSalon({
      actorUserId: ACTOR,
      courseId: curso?.id ?? "",
      nombre: `IT Editar ${marca}`,
      cupo: 8,
      timezone: "America/Bogota",
      holidayCountry: "CO",
      slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00" }],
    });
    classroomId = salon.id;
  });

  afterAll(async () => {
    // Por si una prueba falló antes de borrar: no dejar basura a otros archivos.
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await closePool();
  });

  it("renombrar y mover el inicio COMERCIAL no toca las sesiones", async () => {
    const antes = await sesiones();
    expect(antes).toBeGreaterThan(0);

    await actualizarFechasCampania({
      actorUserId: ACTOR,
      campaignId,
      nombre: `IT Editada ${marca}`,
      inicio: "2026-01-05",
    });

    const fila = await queryOne<{ nombre: string; inicio: string }>(
      `SELECT nombre, inicio::text AS inicio FROM catalog_campaign WHERE id = $1`,
      [campaignId],
    );
    expect(fila?.nombre).toBe(`IT Editada ${marca}`);
    expect(fila?.inicio).toBe("2026-01-05");
    expect(await sesiones()).toBe(antes);
  });

  it("no deja dos campañas con el mismo nombre", async () => {
    const otra = await crearCampania({
      actorUserId: ACTOR,
      nombre: `IT Otra ${marca}`,
      inicio: hoy,
      cursoInicio: hoy,
    });
    try {
      await expect(
        actualizarFechasCampania({
          actorUserId: ACTOR,
          campaignId: otra.id,
          nombre: `IT Editada ${marca}`,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [otra.id]);
    }
  });

  it("con matrículas NO se borra", async () => {
    // Una matrícula basta para bloquear: detrás hay contrato y progreso.
    expect(await matriculasDeCampania(campaignId)).toBe(0);
    const contractId = randomUUID();
    const personaId = randomUUID();
    await execute(
      `INSERT INTO people_person (id, nombres, apellidos, doc_tipo, doc_numero, country_code, updated_at)
       VALUES ($1, 'Bloqueo', $2, 'TI', $3, 'CO', now())`,
      [personaId, `Prueba${marca}`, `B-${marca}`],
    );
    await execute(
      `INSERT INTO contracts_contract
         (id, titular_id, beneficiario_id, country_code, tipo_curso, inicio, final_contrato,
          estado, updated_at)
       VALUES ($1, $2, $2, 'CO', 'JUNIOR', $3::date, ($3::date + INTERVAL '12 months')::date,
               'APROBADO', now())`,
      [contractId, personaId, hoy],
    );
    await execute(
      `INSERT INTO enrollment_enrollment
         (id, contract_id, child_person_id, classroom_id, estado, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVA', now())`,
      [randomUUID(), contractId, personaId, classroomId],
    );

    await expect(eliminarCampania({ actorUserId: ACTOR, campaignId })).rejects.toBeInstanceOf(
      ConflictError,
    );

    // Se limpia para que el último caso pueda borrar de verdad.
    await execute(`DELETE FROM enrollment_enrollment WHERE contract_id = $1`, [contractId]);
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    await execute(`DELETE FROM people_person WHERE id = $1`, [personaId]);
  });

  it("borrar se lleva cursos y SALONES, sin dejar salones huérfanos", async () => {
    const r = await eliminarCampania({ actorUserId: ACTOR, campaignId });
    expect(r.salones).toBe(1);

    for (const [tabla, columna, valor] of [
      ["catalog_campaign", "id", campaignId],
      ["catalog_course", "campaign_id", campaignId],
      ["scheduling_classroom", "id", classroomId],
      ["scheduling_session", "classroom_id", classroomId],
      ["scheduling_slot", "classroom_id", classroomId],
    ] as const) {
      const fila = await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${tabla} WHERE ${columna} = $1`,
        [valor],
      );
      expect({ tabla, n: fila?.n }).toEqual({ tabla, n: 0 });
    }
  });
});
