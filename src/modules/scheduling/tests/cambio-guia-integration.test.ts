import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import {
  agenda,
  cambiarGuia,
  cambiarGuiaDeSesion,
  crearSalon,
  listarSalones,
  obtenerDetalleSesion,
} from "../application/gestion-salones";

/**
 * INTEGRACIÓN: cambio de guía.
 *
 * Son DOS operaciones distintas y la diferencia es el motivo de esta prueba:
 *  - en el SALÓN el cambio mira adelante — toma las sesiones que faltan y deja
 *    intactas las ya dictadas, que deben recordar quién las dio;
 *  - en la SESIÓN es el reemplazo de un día y no toca nada más.
 *
 * Antes las dos pantallas llamaban al mismo endpoint (el del salón), así que
 * reemplazar al guía de un martes reescribía el curso entero, pasado incluido.
 *
 * Se comprueba además que el panel muestre el NOMBRE del guía: su ficha vive en
 * `scheduling_guia`, no en la cuenta, y mirando solo la cuenta se veía el
 * usuario generado.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

describe.runIf(RUN)("cambio de guía (integración)", () => {
  let campaignId: string;
  let courseId: string;
  let classroomId: string;
  let titular: string;
  let reemplazo: string;

  /** Sesiones del salón con su guía crudo, de la más antigua a la más nueva. */
  async function sesiones(): Promise<{ id: string; guia: string | null; pasada: boolean }[]> {
    return queryRows(
      `SELECT id, guia_user_id AS guia, (starts_at < now()) AS pasada
         FROM scheduling_session WHERE classroom_id = $1 ORDER BY starts_at`,
      [classroomId],
    );
  }

  async function guiaDelSalon(): Promise<string | null> {
    const row = await queryOne<{ guia: string | null }>(
      `SELECT guia_user_id AS guia FROM scheduling_classroom WHERE id = $1`,
      [classroomId],
    );
    return row?.guia ?? null;
  }

  beforeAll(async () => {
    campaignId = newId();
    courseId = newId();
    titular = newId();
    reemplazo = newId();

    for (const [id, nombres, apellidos] of [
      [titular, "Ana", "Titular"],
      [reemplazo, "Beto", "Reemplazo"],
    ] as const) {
      await execute(
        `INSERT INTO identity_user (id, username, password_hash, updated_at)
         VALUES ($1, $2, 'x', now())`,
        [id, `it-guia-${id.slice(0, 8)}`],
      );
      // La ficha del guía: de aquí sale el nombre que ve el panel.
      await execute(
        `INSERT INTO scheduling_guia (guia_user_id, nombres, apellidos) VALUES ($1, $2, $3)`,
        [id, nombres, apellidos],
      );
    }

    // Ventana a caballo de hoy: el salón queda con sesiones dictadas y por venir.
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2026-08-03', '2026-11-30',
               ('2026-08-03'::date + INTERVAL '21 days')::date, now())`,
      [campaignId, `IT Guia ${campaignId.slice(0, 8)}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-08-03', '2026-11-30', now())`,
      [courseId, campaignId],
    );

    const salon = await crearSalon({
      actorUserId: titular,
      courseId,
      nombre: `Salón Guía ${courseId.slice(0, 8)}`,
      cupo: 12,
      guiaUserId: titular,
      meetingUrl: null,
      timezone: "America/Santiago",
      holidayCountry: "CL",
      slots: [{ tipo: "SESION", diaSemana: 1, horaLocal: "18:00" }],
    });
    classroomId = salon.id;
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await execute(`DELETE FROM scheduling_guia WHERE guia_user_id = ANY($1)`, [
      [titular, reemplazo],
    ]);
    await execute(`DELETE FROM identity_user WHERE id = ANY($1)`, [[titular, reemplazo]]);
    await closePool();
  });

  it("el panel muestra el NOMBRE del guía, no su usuario", async () => {
    const [primera] = await sesiones();
    const detalle = await obtenerDetalleSesion(primera?.id ?? "");
    expect(detalle.guia?.nombre).toBe("Ana Titular");
    expect(detalle.guia?.soloEstaSesion).toBe(false);
  });

  it("el calendario y la lista de salones también, con su campaña", async () => {
    // Mismas tres consultas, mismo defecto: se leía el nombre de `people_person`.
    const dia = await agenda({ desde: "2026-08-03", hasta: "2026-11-30", campaignId });
    expect(dia.length).toBeGreaterThan(0);
    for (const s of dia) {
      expect(s.guia).toBe("Ana Titular");
      expect(s.campania).toContain("IT Guia");
    }

    const salones = (await listarSalones(courseId)).filter((s) => s.id === classroomId);
    expect(salones[0]?.guia).toBe("Ana Titular");
  });

  it("cambiar el guía en la SESIÓN no toca el salón ni las demás sesiones", async () => {
    const antes = await sesiones();
    const futura = antes.find((s) => !s.pasada);
    expect(futura).toBeDefined();

    await cambiarGuiaDeSesion({
      actorUserId: titular,
      sessionId: futura?.id ?? "",
      guiaUserId: reemplazo,
    });

    expect(await guiaDelSalon()).toBe(titular);
    const despues = await sesiones();
    for (const s of despues) {
      expect(s.guia).toBe(s.id === futura?.id ? reemplazo : null);
    }

    const detalle = await obtenerDetalleSesion(futura?.id ?? "");
    expect(detalle.guia?.nombre).toBe("Beto Reemplazo");
    expect(detalle.guia?.soloEstaSesion).toBe(true);
  });

  it("cambiar el guía en el SALÓN congela las dictadas y se lleva las que faltan", async () => {
    const antes = await sesiones();
    const pasadas = antes.filter((s) => s.pasada).length;
    const futuras = antes.length - pasadas;
    // La ventana tiene que dar sesiones de los dos lados, si no la prueba no prueba nada.
    expect(pasadas).toBeGreaterThan(0);
    expect(futuras).toBeGreaterThan(0);

    const cambio = await cambiarGuia({
      actorUserId: titular,
      classroomId,
      guiaUserId: reemplazo,
    });

    expect(cambio.pasadasCongeladas).toBe(pasadas);
    expect(cambio.futurasAsignadas).toBe(futuras);
    // El reemplazo de un día del caso anterior era futuro: se lo lleva el cambio.
    expect(cambio.futurasSoltadas).toBe(1);

    expect(await guiaDelSalon()).toBe(reemplazo);
    for (const s of await sesiones()) {
      // Pasada: guarda a quien la dictó. Futura: hereda (null) al nuevo del salón.
      expect(s.guia).toBe(s.pasada ? titular : null);
    }
  });

  it("y el guía efectivo de una sesión ya dictada sigue siendo el de entonces", async () => {
    const dictada = (await sesiones()).find((s) => s.pasada);
    const detalle = await obtenerDetalleSesion(dictada?.id ?? "");
    expect(detalle.guia?.userId).toBe(titular);
    expect(detalle.guia?.nombre).toBe("Ana Titular");
  });
});
