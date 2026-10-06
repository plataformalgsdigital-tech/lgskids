import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { actualizarCursoReferencia, crearCursoReferencia } from "../application/curso-referencia";

/**
 * EDITAR una lección del catálogo Curso no borra lo que el editor no manda
 * (corregido 2026-10-06). Gestión de Contenido envía solo temario, video,
 * actividades y cuestionarios; antes, guardar dejaba en `[]` el material del
 * guía y del alumno, los recursos y los clubes, y las actividades perdían su
 * zona sobre la lámina (la API descarta `x/y/w/h`).
 *
 * Usa una lección con nombre único de la prueba: `catalog_curso` es la tabla
 * MAESTRA con el temario real y las pruebas corren en paralelo.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const leccion = `Editar ${randomUUID().slice(0, 8)}`;

const leer = (id: string) =>
  queryOne<{
    contenido: string | null;
    video: string | null;
    quiz: unknown;
    material_guia: unknown;
    material_usuario: unknown;
    recursos: unknown;
    clubes: unknown;
    actividades: unknown;
  }>(
    `SELECT contenido, video, quiz, material_guia, material_usuario, recursos, clubes, actividades
       FROM catalog_curso WHERE id = $1`,
    [id],
  );

describe.runIf(RUN)("editar una lección del catálogo Curso (integración)", () => {
  let id: string;

  afterAll(async () => {
    await execute(`DELETE FROM catalog_curso WHERE leccion = $1`, [leccion]);
    await closePool();
  });

  it("guardar desde Gestión de Contenido conserva material, recursos, clubes y zonas", async () => {
    const r = await crearCursoReferencia({
      actorUserId: ACTOR,
      curso: "YOUNGSTER",
      nivel: "ULTIMATE",
      unidad: "Unidad 3",
      leccion,
      orden: 950,
      contenido: "Temario viejo",
      video: "https://v/1",
      materialGuia: [{ nombre: "Guía", url: "g.pdf" }],
      materialUsuario: [{ nombre: "Ficha", url: "f.pdf" }],
      recursos: [{ nombre: "Flashcards", link: "https://r/1" }],
      clubes: [{ nombre: "Club", link: "https://c/1" }],
      actividades: [{ nombre: "Juego", link: "https://w/1" }],
      quiz: { cuestionarios: [] },
    });
    id = r.id;
    // La zona del juego la pone el editor de juegos, no estos editores.
    await execute(`UPDATE catalog_curso SET actividades = $2::jsonb WHERE id = $1`, [
      id,
      JSON.stringify([{ nombre: "Juego", link: "https://w/1", x: 30, y: 40, w: 10, h: 6 }]),
    ]);

    // Exactamente lo que manda Gestión de Contenido (sin material, recursos ni
    // clubes; actividades SIN zona, porque la API la descarta).
    const quiz = { cuestionarios: [{ titulo: "Quiz 1", minutos: 10, preguntas: [] }] };
    await actualizarCursoReferencia({
      actorUserId: ACTOR,
      id,
      curso: "YOUNGSTER",
      nivel: "ULTIMATE",
      unidad: "Unidad 3",
      leccion,
      orden: 950,
      contenido: "Temario nuevo",
      video: "https://v/1",
      actividades: [{ nombre: "Juego renombrado", link: "https://w/1" }],
      quiz,
    });

    const fila = await leer(id);
    expect(fila?.contenido).toBe("Temario nuevo");
    expect(fila?.quiz).toEqual(quiz);
    expect(fila?.material_guia).toEqual([{ nombre: "Guía", url: "g.pdf" }]);
    expect(fila?.material_usuario).toEqual([{ nombre: "Ficha", url: "f.pdf" }]);
    expect(fila?.recursos).toEqual([{ nombre: "Flashcards", link: "https://r/1" }]);
    expect(fila?.clubes).toEqual([{ nombre: "Club", link: "https://c/1" }]);
    expect(fila?.actividades).toEqual([
      { nombre: "Juego renombrado", link: "https://w/1", x: 30, y: 40, w: 10, h: 6 },
    ]);
  });

  it("lo que viene VACÍO sí borra: es lo que pidió quien editó", async () => {
    await actualizarCursoReferencia({
      actorUserId: ACTOR,
      id,
      curso: "YOUNGSTER",
      nivel: "ULTIMATE",
      unidad: "Unidad 3",
      leccion,
      recursos: [],
      video: null,
      quiz: null,
    });
    const fila = await leer(id);
    expect(fila?.recursos).toEqual([]);
    expect(fila?.video).toBeNull();
    expect(fila?.quiz).toBeNull();
    // Y lo que no vino sigue igual.
    expect(fila?.contenido).toBe("Temario nuevo");
    expect(fila?.clubes).toEqual([{ nombre: "Club", link: "https://c/1" }]);
  });
});
