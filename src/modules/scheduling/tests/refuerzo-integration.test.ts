import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { crearSalon, regenerarSesiones } from "../application/gestion-salones";
import {
  listarRefuerzos,
  resolverRepeticion,
  solicitarRepeticion,
} from "../application/registro-sesion";

/**
 * INTEGRACIÓN: refuerzo de sesión.
 *
 * Autorizar una repetición crea una clase EXTRA. Lo que se prueba aquí es
 * justo lo que se rompe en silencio si alguien "mejora" el flujo más adelante:
 *  - el refuerzo nace SIN slot, así que la regeneración —destructiva por
 *    diseño (regla 2)— no se lo lleva;
 *  - `final_curso` no se toca (regla 1): es una clase extra, no una prórroga;
 *  - si la creación falla, la solicitud NO queda aprobada sin clase.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

describe.runIf(RUN)("refuerzo de sesión (integración)", () => {
  let campaignId: string;
  let courseId: string;
  let classroomId: string;
  let guiaId: string;
  let sessionId: string;
  let repeticionId: string;
  let cursoRefId: string;

  beforeAll(async () => {
    campaignId = newId();
    courseId = newId();
    guiaId = newId();
    cursoRefId = newId();

    await execute(
      `INSERT INTO identity_user (id, username, password_hash, updated_at)
       VALUES ($1, $2, 'x', now())`,
      [guiaId, `it-refuerzo-${guiaId.slice(0, 8)}`],
    );
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2026-08-03', '2026-10-25',
               ('2026-08-03'::date + INTERVAL '21 days')::date, now())`,
      [campaignId, `IT Refuerzo ${campaignId.slice(0, 8)}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-08-03', '2026-10-25', now())`,
      [courseId, campaignId],
    );
    // Lección de la referencia curricular: es la que el guía señala al pedir
    // el refuerzo. Vive fuera de la campaña, en la tabla maestra.
    await execute(
      `INSERT INTO catalog_curso (id, curso, nivel, unidad, leccion, orden)
       VALUES ($1, 'JUNIOR', 'ROOKIE', 'Unidad IT', 'Lección IT', 999)`,
      [cursoRefId],
    );

    const salon = await crearSalon({
      actorUserId: guiaId,
      courseId,
      nombre: "Salón Refuerzo",
      cupo: 12,
      meetingUrl: "https://meet.example.com/refuerzo",
      timezone: "America/Santiago",
      holidayCountry: "CL",
      slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "18:00" }],
    });
    classroomId = salon.id;
    await execute(`UPDATE scheduling_classroom SET guia_user_id = $2 WHERE id = $1`, [
      classroomId,
      guiaId,
    ]);

    const primera = await queryOne<{ id: string }>(
      `SELECT id FROM scheduling_session WHERE classroom_id = $1 ORDER BY fecha LIMIT 1`,
      [classroomId],
    );
    sessionId = primera?.id ?? "";
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await execute(`DELETE FROM catalog_curso WHERE id = $1`, [cursoRefId]);
    await execute(`DELETE FROM identity_user WHERE id = $1`, [guiaId]);
    await closePool();
  });

  it("el guía solicita y la bandeja de coordinación la muestra con su contexto", async () => {
    const { id } = await solicitarRepeticion({
      actorUserId: guiaId,
      sessionId,
      motivo: "Se cortó la conexión y quedó la mitad de la lección.",
      repetirLeccion: true,
      cursoRefId,
    });
    repeticionId = id;

    const bandeja = await listarRefuerzos({ classroomId });
    const fila = bandeja.find((r) => r.id === id);
    expect(fila).toBeDefined();
    expect(fila?.estado).toBe("PENDIENTE");
    expect(fila?.salon).toBe("Salón Refuerzo");
    expect(fila?.cursoTipo).toBe("JUNIOR");
    expect(fila?.pais).toBe("CL");
    // La lección viaja como REFERENCIA, ya legible para coordinación.
    expect(fila?.leccionRef).toBe("ROOKIE · Unidad IT · Lección IT");
  });

  it("aprobar sin fecha no aprueba nada: la solicitud sigue pendiente", async () => {
    await expect(
      resolverRepeticion({ actorUserId: guiaId, repeticionId, aprobar: true }),
    ).rejects.toThrow();

    const fila = await queryOne<{ estado: string }>(
      `SELECT estado FROM scheduling_repeticion WHERE id = $1`,
      [repeticionId],
    );
    expect(fila?.estado).toBe("PENDIENTE");
  });

  it("chocar con una sesión existente deja la solicitud intacta (todo o nada)", async () => {
    // El salón dicta los martes a las 18:00: pedir el refuerzo ahí choca.
    const existente = await queryOne<{ fecha: string }>(
      `SELECT fecha::text AS fecha FROM scheduling_session
        WHERE classroom_id = $1 ORDER BY fecha LIMIT 1`,
      [classroomId],
    );
    await expect(
      resolverRepeticion({
        actorUserId: guiaId,
        repeticionId,
        aprobar: true,
        refuerzo: { fecha: existente?.fecha ?? "", horaLocal: "18:00", duracionMin: 60 },
      }),
    ).rejects.toThrow();

    const fila = await queryOne<{ estado: string; sesion_refuerzo_id: string | null }>(
      `SELECT estado, sesion_refuerzo_id FROM scheduling_repeticion WHERE id = $1`,
      [repeticionId],
    );
    expect(fila?.estado).toBe("PENDIENTE");
    expect(fila?.sesion_refuerzo_id).toBeNull();
  });

  it("aprobar crea una clase EXTRA sin slot y no toca final_curso", async () => {
    const antes = await queryOne<{ n: string; fin: string }>(
      `SELECT (SELECT count(*) FROM scheduling_session WHERE classroom_id = $1)::text AS n,
              (SELECT final_curso::text FROM catalog_course WHERE id = $2) AS fin`,
      [classroomId, courseId],
    );

    const { sesionRefuerzoId } = await resolverRepeticion({
      actorUserId: guiaId,
      repeticionId,
      aprobar: true,
      nota: "Autoriza coordinación.",
      refuerzo: { fecha: "2026-09-02", horaLocal: "20:30", duracionMin: 60 },
    });
    expect(sesionRefuerzoId).not.toBeNull();

    const despues = await queryOne<{ n: string; fin: string }>(
      `SELECT (SELECT count(*) FROM scheduling_session WHERE classroom_id = $1)::text AS n,
              (SELECT final_curso::text FROM catalog_course WHERE id = $2) AS fin`,
      [classroomId, courseId],
    );
    expect(Number(despues?.n)).toBe(Number(antes?.n) + 1);
    // Es una clase extra, no una prórroga.
    expect(despues?.fin).toBe(antes?.fin);

    const creada = await queryOne<{
      slot_id: string | null;
      numero: number;
      nivel: string | null;
      observaciones: string | null;
    }>(`SELECT slot_id, numero, nivel, observaciones FROM scheduling_session WHERE id = $1`, [
      sesionRefuerzoId ?? "",
    ]);
    expect(creada?.slot_id).toBeNull();
    // La clase extra queda rotulada con la lección que se pidió repetir.
    expect(creada?.nivel).toBe("ROOKIE");
    expect(creada?.observaciones).toContain("ROOKIE · Unidad IT · Lección IT");
    // Fuera de la numeración del curso: no corre las sesiones que ya existían.
    expect(creada?.numero).toBe(0);
  });

  it("regenerar el salón NO se lleva el refuerzo", async () => {
    const fila = await queryOne<{ sesion_refuerzo_id: string }>(
      `SELECT sesion_refuerzo_id FROM scheduling_repeticion WHERE id = $1`,
      [repeticionId],
    );
    const refuerzoId = fila?.sesion_refuerzo_id ?? "";

    await regenerarSesiones({ actorUserId: guiaId, classroomId });

    const vive = await queryOne<{ id: string }>(`SELECT id FROM scheduling_session WHERE id = $1`, [
      refuerzoId,
    ]);
    expect(vive?.id).toBe(refuerzoId);
  });

  it("una solicitud resuelta no se resuelve dos veces", async () => {
    await expect(
      resolverRepeticion({ actorUserId: guiaId, repeticionId, aprobar: false }),
    ).rejects.toThrow();
  });
});
