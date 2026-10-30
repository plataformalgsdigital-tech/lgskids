import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eliminarArchivo } from "@/modules/files";
import { env } from "@/platform/config/env";
import { execute, queryRows } from "@/platform/db/query";
import { closePool } from "@/platform/db/pool";
import { NotFoundError, ValidationError } from "@/platform/errors";
import {
  agregarAvisoLogin,
  avisosLoginVigentes,
  descargarAvisoLoginPublico,
  editarAvisosLogin,
  getAvisoLogin,
  quitarAvisoLogin,
  setAvisoLoginActivo,
} from "../application/aviso-login";

const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const CLAVES = ["login_avisos", "login_aviso_activo"];

// PNG 1x1 válido.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const subir = (nombre: string) =>
  agregarAvisoLogin({ actorUserId: ACTOR, nombreOriginal: `${nombre}.png`, mime: "image/png", bytes: PNG, nombre });

describe.runIf(RUN)("avisos del login (integración)", () => {
  let respaldo: { clave: string; valor: string }[] = [];
  const archivos = new Set<string>();

  beforeAll(async () => {
    // Las claves son globales: se respaldan y se restauran al final.
    respaldo = await queryRows<{ clave: string; valor: string }>(
      `SELECT clave, valor FROM platform_config WHERE clave = ANY($1)`,
      [CLAVES],
    );
    await execute(`DELETE FROM platform_config WHERE clave = 'login_avisos'`);
    await setAvisoLoginActivo(true, ACTOR);
  });

  afterAll(async () => {
    for (const a of (await getAvisoLogin()).avisos) archivos.add(a.fileId);
    for (const id of archivos) await eliminarArchivo(id);
    await execute(`DELETE FROM platform_config WHERE clave = ANY($1)`, [CLAVES]);
    for (const r of respaldo) {
      await execute(
        `INSERT INTO platform_config (clave, valor, actualizado_por, actualizado_en) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [r.clave, r.valor, ACTOR],
      );
    }
    await closePool();
  });

  it("deja dos avisos y, al quitar uno, el otro sigue solo", async () => {
    // Sin carrusel guardado puede aparecer el aviso único de antes: se parte de cero.
    for (const a of (await getAvisoLogin()).avisos) await quitarAvisoLogin(a.id, ACTOR);

    await subir("Uno");
    const conDos = await subir("Dos");
    expect(conDos.avisos.map((a) => a.nombre)).toEqual(["Uno", "Dos"]);
    expect(await avisosLoginVigentes()).toHaveLength(2);
    for (const a of conDos.avisos) archivos.add(a.fileId);

    const [uno, dos] = conDos.avisos;
    const quedan = await quitarAvisoLogin(uno?.id ?? "", ACTOR);
    expect(quedan.avisos).toHaveLength(1);
    expect(quedan.avisos[0]?.id).toBe(dos?.id);
    expect(quedan.avisos[0]?.orden).toBe(1);
    // La imagen del que queda se sigue sirviendo.
    expect((await descargarAvisoLoginPublico(dos?.id ?? null)).meta.mime).toMatch(/^image\//);
    // La del quitado ya no.
    await expect(descargarAvisoLoginPublico(uno?.id ?? null)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("admite máximo 3", async () => {
    await subir("Tres");
    await subir("Cuatro");
    expect((await getAvisoLogin()).avisos).toHaveLength(3);
    await expect(subir("Sobra")).rejects.toBeInstanceOf(ValidationError);
  });

  it("respeta fechas, el apagado de cada aviso y el interruptor general", async () => {
    const { avisos } = await getAvisoLogin();
    const [a, b, c] = avisos;
    await editarAvisosLogin(
      [
        { id: c?.id ?? "" }, // reordena: el tercero pasa a primero
        { id: a?.id ?? "", desde: "2999-01-01" }, // programado a futuro
        { id: b?.id ?? "", activo: false },
      ],
      ACTOR,
    );
    const vigentes = await avisosLoginVigentes();
    expect(vigentes.map((v) => v.id)).toEqual([c?.id]);
    await expect(descargarAvisoLoginPublico(a?.id ?? null)).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      editarAvisosLogin([{ id: c?.id ?? "" }], ACTOR), // lista incompleta
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      editarAvisosLogin(
        [{ id: c?.id ?? "", desde: "2026-12-10", hasta: "2026-12-01" }, { id: a?.id ?? "" }, { id: b?.id ?? "" }],
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await setAvisoLoginActivo(false, ACTOR);
    expect(await avisosLoginVigentes()).toHaveLength(0);
    await expect(descargarAvisoLoginPublico(null)).rejects.toBeInstanceOf(NotFoundError);
  });
});
