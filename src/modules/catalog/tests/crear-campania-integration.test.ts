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
      cursoInicio: "2026-08-17",
    });
    campaignId = campania.id;
    expect(campania.fin).toBe("2027-08-03"); // inicio + 12 meses
    expect(campania.finalVenta).toBe("2026-09-07"); // inicio del curso + 3 semanas

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
    // 2 cursos × 5 niveles = 10; × 4 lecciones = 40;
    // quizzes: 40 prácticas + 10 level up = 50.
    expect(conteos).toEqual({ cursos: "2", niveles: "10", lecciones: "40", quizzes: "50" });
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
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.total === "1")).toBe(true);
  });

  it("el detalle arma el árbol completo con final_curso nominal", async () => {
    const detalle = await detalleCampania(campaignId as string);
    expect(detalle.courses).toHaveLength(2);
    for (const curso of detalle.courses) {
      expect(curso.finalCurso).toBe("2027-08-03");
      expect(curso.inicio).toBe("2026-08-17"); // inicio del curso
      expect(curso.niveles.map((n) => n.codigo)).toEqual([
        "ROOKIE",
        "CHAMPION",
        "ELITE",
        "LEGENDARY",
        "ULTIMATE",
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
        cursoInicio: "2026-09-14",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
