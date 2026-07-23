import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ConflictError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { crearCampania } from "../application/crear-campania";
import { detalleCampania } from "../application/consultas";

/**
 * INTEGRACIÓN: la generación transaccional completa de una campaña
 * (sección 2.2). Se activa con INTEGRATION_TESTS=1 (CI).
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

describe.runIf(RUN)("crearCampania (integración con Postgres)", () => {
  const nombre = `IT Campaña ${newId().slice(0, 8)}`;
  let campaignId: string | undefined;

  afterAll(async () => {
    if (campaignId !== undefined) {
      // Cascada FK: borra cursos, niveles, lecciones y cuestionarios.
      await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    }
    await closePool();
  });

  it("genera la estructura COMPLETA en una transacción", async () => {
    const campania = await crearCampania({
      actorUserId: "00000000-0000-0000-0000-000000000000",
      nombre,
      inicio: "2026-08-03",
      duracionSemanas: 12,
    });
    campaignId = campania.id;
    expect(campania.fin).toBe("2026-10-25");

    const conteos = await queryOne<{
      cursos: string;
      niveles: string;
      lecciones: string;
      quizzes: string;
    }>(
      `SELECT
         (SELECT count(*) FROM catalog_course WHERE campaign_id = $1)::text AS cursos,
         (SELECT count(*) FROM catalog_level n JOIN catalog_course c ON c.id = n.course_id WHERE c.campaign_id = $1)::text AS niveles,
         (SELECT count(*) FROM catalog_lesson l JOIN catalog_level n ON n.id = l.level_id JOIN catalog_course c ON c.id = n.course_id WHERE c.campaign_id = $1)::text AS lecciones,
         (SELECT count(*) FROM catalog_quiz q JOIN catalog_level n ON n.id = q.level_id JOIN catalog_course c ON c.id = n.course_id WHERE c.campaign_id = $1)::text AS quizzes`,
      [campaignId],
    );
    // 2 cursos × 4 niveles = 8; × 4 lecciones = 32;
    // quizzes: 32 prácticas + 8 level up = 40.
    expect(conteos).toEqual({ cursos: "2", niveles: "8", lecciones: "32", quizzes: "40" });
  });

  it("cada nivel tiene exactamente UN Level Up", async () => {
    const rows = await queryRows<{ level_id: string; total: string }>(
      `SELECT q.level_id, count(*)::text AS total
         FROM catalog_quiz q
         JOIN catalog_level n ON n.id = q.level_id
         JOIN catalog_course c ON c.id = n.course_id
        WHERE c.campaign_id = $1 AND q.tipo = 'LEVEL_UP'
        GROUP BY q.level_id`,
      [campaignId],
    );
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.total === "1")).toBe(true);
  });

  it("el detalle arma el árbol completo con final_curso nominal", async () => {
    const detalle = await detalleCampania(campaignId as string);
    expect(detalle.courses).toHaveLength(2);
    for (const curso of detalle.courses) {
      expect(curso.finalCurso).toBe("2026-10-25");
      expect(curso.niveles.map((n) => n.codigo)).toEqual([
        "ROOKIE",
        "CHAMPION",
        "ELITE",
        "LEGENDARY",
      ]);
      for (const nivel of curso.niveles) {
        expect(nivel.lecciones).toHaveLength(4);
        expect(nivel.cuestionarios.filter((q) => q.tipo === "PRACTICA")).toHaveLength(4);
        expect(nivel.cuestionarios.filter((q) => q.tipo === "LEVEL_UP")).toHaveLength(1);
      }
    }
  });

  it("rechaza nombre duplicado (aunque cambie mayúsculas)", async () => {
    await expect(
      crearCampania({
        actorUserId: "00000000-0000-0000-0000-000000000000",
        nombre: nombre.toUpperCase(),
        inicio: "2026-09-01",
        duracionSemanas: 4,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
