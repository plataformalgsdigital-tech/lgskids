import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { subirArchivo } from "@/modules/files";
import { execute, queryRows } from "@/platform/db/query";
import { importarLibro, leerLibro, listarLibros } from "../application/libro";
import { insigniasDeNivelNombres } from "../application/libro";
import { audiosDeLibro, registrarAudioLibro } from "../application/libro-audio";

/**
 * El libro es el primer dato del catálogo que escribe un EDITOR y lee un NIÑO.
 * Lo que se prueba aquí es lo que el lector da por hecho y no puede comprobar
 * por su cuenta: que las páginas lleguen en orden, que no haya ids repetidos
 * —con los que se guarda la respuesta— y que reimportar reemplace en vez de
 * acumular.
 */

const CORRE = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const CURSO = "JUNIOR";
const NIVEL = "ULTIMATE"; // nivel poco usado: no pisa datos de Rookie
const CODIGO = "TEST UNIT 0-1";
const ACTOR = "00000000-0000-0000-0000-000000000001";

const libroBase = {
  curso: CURSO,
  nivel: NIVEL,
  codigo: CODIGO,
  titulo: "Libro de prueba",
  paginas: [
    {
      pagina: 0,
      pliego: 1,
      parada: 0,
      titulo: "Welcome",
      elementos: [{ tipo: "narracion", id: "p0-a", personaje: "simba" }],
    },
    {
      pagina: 1,
      pliego: 2,
      parada: 1,
      titulo: "All about me",
      elementos: [
        { tipo: "texto", id: "p1-a", clave: "one" },
        { tipo: "dibujo", id: "p1-b", libre: true },
      ],
    },
  ],
  insignias: [{ parada: 0, nombre: "Let's chat about me" }],
};

describe.runIf(CORRE)("libro interactivo", () => {
  beforeAll(async () => {
    await execute(
      `INSERT INTO identity_user (id, username, password_hash, updated_at)
         VALUES ($1, 'test-libro', 'x', CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [ACTOR],
    );
  });

  afterAll(async () => {
    await execute(
      `DELETE FROM catalog_libro WHERE curso = $1::catalog_course_tipo AND nivel = $2 AND codigo = $3`,
      [CURSO, NIVEL, CODIGO],
    );
    await execute(
      `DELETE FROM catalog_insignia WHERE curso = $1::catalog_course_tipo AND nivel = $2`,
      [CURSO, NIVEL],
    );
    await closePool();
  });

  it("importa y devuelve las páginas en orden", async () => {
    const r = await importarLibro({ actorUserId: ACTOR, libro: libroBase });
    expect(r.paginas).toBe(2);

    const leido = await leerLibro(CURSO, NIVEL, CODIGO);
    expect(leido.paginas.map((p) => p.pagina)).toEqual([0, 1]);
    expect(leido.paginas[0]?.elementos[0]?.id).toBe("p0-a");
    expect(leido.paginas[1]?.elementos).toHaveLength(2);
  });

  it("acota a una sola parada del mapa", async () => {
    await importarLibro({ actorUserId: ACTOR, libro: libroBase });
    const soloWelcome = await leerLibro(CURSO, NIVEL, CODIGO, 0);
    expect(soloWelcome.paginas).toHaveLength(1);
    expect(soloWelcome.paginas[0]?.parada).toBe(0);
  });

  it("reimportar REEMPLAZA: no acumula páginas viejas", async () => {
    await importarLibro({ actorUserId: ACTOR, libro: libroBase });
    await importarLibro({
      actorUserId: ACTOR,
      libro: { ...libroBase, paginas: [libroBase.paginas[0]!] },
    });
    const leido = await leerLibro(CURSO, NIVEL, CODIGO);
    expect(leido.paginas).toHaveLength(1);
  });

  it("guarda el nombre de la insignia por parada", async () => {
    await importarLibro({ actorUserId: ACTOR, libro: libroBase });
    const nombres = await insigniasDeNivelNombres(CURSO, NIVEL);
    expect(nombres[0]).toBe("Let's chat about me");
  });

  it("rechaza dos elementos con el mismo id en una página", async () => {
    // Es el que más importa: con ids repetidos la respuesta de uno pisa la del
    // otro y nadie se entera hasta que falta una nota.
    await expect(
      importarLibro({
        actorUserId: ACTOR,
        libro: {
          ...libroBase,
          paginas: [
            {
              pagina: 0,
              parada: 0,
              elementos: [
                { tipo: "texto", id: "repe" },
                { tipo: "dibujo", id: "repe" },
              ],
            },
          ],
        },
      }),
    ).rejects.toThrow(/se repite/i);
  });

  it("rechaza la misma página dos veces", async () => {
    await expect(
      importarLibro({
        actorUserId: ACTOR,
        libro: {
          ...libroBase,
          paginas: [
            { pagina: 3, parada: 1, elementos: [] },
            { pagina: 3, parada: 1, elementos: [] },
          ],
        },
      }),
    ).rejects.toThrow(/dos veces/i);
  });

  it("rechaza una parada fuera del mapa", async () => {
    await expect(
      importarLibro({
        actorUserId: ACTOR,
        libro: { ...libroBase, paginas: [{ pagina: 0, parada: 9, elementos: [] }] },
      }),
    ).rejects.toThrow(/parada inválida/i);
  });

  it("acepta la parada 0: el Welcome es parada de pleno derecho", async () => {
    const r = await importarLibro({
      actorUserId: ACTOR,
      libro: {
        ...libroBase,
        paginas: [{ pagina: 0, parada: 0, elementos: [{ tipo: "texto", id: "w" }] }],
      },
    });
    expect(r.paginas).toBe(1);
  });

  it("rechaza un elemento sin id o sin tipo", async () => {
    await expect(
      importarLibro({
        actorUserId: ACTOR,
        libro: {
          ...libroBase,
          paginas: [{ pagina: 0, parada: 0, elementos: [{ tipo: "texto" } as never] }],
        },
      }),
    ).rejects.toThrow(/no tiene id/i);
  });

  it("reemplazar una pista SUELTA el archivo anterior: reimportar no duplica bytes", async () => {
    // Fue un fallo real: `subirArchivo` siempre crea un archivo nuevo, así que
    // reimportar los 34 audios dejaba otros 34 huérfanos ocupando disco.
    const { libroId } = await importarLibro({ actorUserId: ACTOR, libro: libroBase });
    const pista = async (contenido: string): Promise<string> =>
      (
        await subirArchivo({
          actorUserId: ACTOR,
          nombreOriginal: "PAG99-01.mp3",
          mime: "audio/mpeg",
          bytes: Buffer.from(contenido),
          entidad: "catalog_libro_audio",
        })
      ).id;

    const viejo = await pista("uno");
    await registrarAudioLibro({
      libroId,
      pliego: 99,
      orden: 1,
      fileId: viejo,
      nombreOriginal: "PAG99-01.mp3",
    });
    const nuevo = await pista("dos");
    await registrarAudioLibro({
      libroId,
      pliego: 99,
      orden: 1,
      fileId: nuevo,
      nombreOriginal: "PAG99-01.mp3",
    });

    // Una sola pista en ese hueco, apuntando a la última subida.
    const pistas = (await audiosDeLibro(libroId)).filter((p) => p.pliego === 99);
    expect(pistas).toHaveLength(1);
    expect(pistas[0]?.url).toContain(nuevo);

    // Y el archivo anterior ya no existe.
    const quedan = await queryRows<{ n: string }>(
      `SELECT COUNT(*)::text n FROM files_object WHERE id = $1`,
      [viejo],
    );
    expect(quedan[0]?.n).toBe("0");
  });

  it("aparece al listar los libros del nivel", async () => {
    await importarLibro({ actorUserId: ACTOR, libro: libroBase });
    const lista = await listarLibros(CURSO, NIVEL);
    const mio = lista.find((l) => l.codigo === CODIGO);
    expect(mio?.paginas).toBe(2);
  });
});
