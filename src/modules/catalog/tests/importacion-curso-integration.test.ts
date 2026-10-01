import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import { importarCursoReferencia, validarImportacionCurso } from "../application/curso-referencia";

/**
 * Carga del catálogo Curso por CSV (Administración › Mantenimiento). Usa
 * lecciones con un nombre único de esta prueba: `catalog_curso` es la tabla
 * MAESTRA con el temario real y las pruebas corren en paralelo.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 8);
const leccion = (n: number) => `Prueba ${marca} ${String(n)}`;
const fila = (n: number, extra: Record<string, unknown> = {}) => ({
  curso: "YOUNGSTER",
  nivel: "ULTIMATE",
  unidad: "Unidad 2",
  leccion: leccion(n),
  orden: 900 + n,
  ...extra,
});
const leer = (n: number) =>
  queryOne<{ contenido: string | null; video: string | null; quiz: unknown; actividades: unknown }>(
    `SELECT contenido, video, quiz, actividades FROM catalog_curso WHERE leccion = $1`,
    [leccion(n)],
  );

describe.runIf(RUN)("carga del catálogo Curso por CSV (integración)", () => {
  afterAll(async () => {
    await execute(`DELETE FROM catalog_curso WHERE leccion LIKE $1`, [`Prueba ${marca}%`]);
    await closePool();
  });

  it("VALIDAR no escribe nada y dice qué se va a crear", async () => {
    const v = await validarImportacionCurso([fila(1, { contenido: "Uno" })]);
    expect(v.resumen).toEqual({ crear: 1, actualizar: 0, sinCambios: 0, errores: 0 });
    expect(await leer(1)).toBeNull();
  });

  it("cargar crea; volver a cargar lo mismo no cambia nada", async () => {
    const r = await importarCursoReferencia({
      actorUserId: ACTOR,
      filas: [fila(1, { contenido: "Uno", video: "https://v/1" })],
    });
    expect(r.crear).toBe(1);
    const otraVez = await validarImportacionCurso([
      fila(1, { contenido: "Uno", video: "https://v/1" }),
    ]);
    expect(otraVez.resumen.sinCambios).toBe(1);
  });

  it("actualizar NO borra los cuestionarios ni la zona del juego en la lámina", async () => {
    const quiz = { cuestionarios: [{ titulo: "Quiz", minutos: 10, preguntas: [] }] };
    await execute(
      `UPDATE catalog_curso SET quiz = $2::jsonb, actividades = $3::jsonb WHERE leccion = $1`,
      [
        leccion(1),
        JSON.stringify(quiz),
        JSON.stringify([{ nombre: "Game", link: "https://w/1", x: 30, y: 40, w: 10, h: 6 }]),
      ],
    );

    const v = await validarImportacionCurso([
      fila(1, { contenido: "Uno bis", actividades: [{ nombre: "Game!", link: "https://w/1" }] }),
    ]);
    expect(v.filas[0]).toMatchObject({
      accion: "ACTUALIZAR",
      cambios: ["contenido", "actividades"],
    });

    await importarCursoReferencia({
      actorUserId: ACTOR,
      filas: [
        fila(1, { contenido: "Uno bis", actividades: [{ nombre: "Game!", link: "https://w/1" }] }),
      ],
    });
    const despues = await leer(1);
    expect(despues?.contenido).toBe("Uno bis");
    expect(despues?.quiz).toEqual(quiz);
    expect(despues?.actividades).toEqual([
      { nombre: "Game!", link: "https://w/1", x: 30, y: 40, w: 10, h: 6 },
    ]);
    // La columna `video` no vino en esta carga: no se tocó.
    expect(despues?.video).toBe("https://v/1");
  });

  it("es TODO o NADA: con una fila mala no se escribe ninguna", async () => {
    const filas = [fila(2, { contenido: "Dos" }), fila(2, { contenido: "Dos repetida" })];
    const v = await validarImportacionCurso(filas);
    expect(v.resumen.errores).toBe(1);
    expect(v.filas[1]?.error).toMatch(/repetida/);

    await expect(importarCursoReferencia({ actorUserId: ACTOR, filas })).rejects.toBeInstanceOf(
      ValidationError,
    );
    // La fila buena tampoco quedó.
    expect(await leer(2)).toBeNull();
  });
});
