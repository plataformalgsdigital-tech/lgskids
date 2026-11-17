import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { metaArchivo } from "@/modules/files";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { crearCursoReferencia, eliminarCursoReferencia } from "../application/curso-referencia";
import {
  archivoDeMaterialGuia,
  editarMaterialGuia,
  eliminarMaterialGuia,
  listarMaterialGuia,
  subirMaterialGuia,
  tokenOfficeParaItem,
  tokenOfficeValido,
} from "../application/material-guia";

/**
 * MATERIAL GUÍA: el material y los recursos que el guía abre desde la sesión, por
 * lección. Se fija:
 *  - Material admite PPT/PPTX y PDF; Recursos, imágenes, mp4 y enlaces (nada cruzado);
 *  - un ítem es un archivo o un enlace, nunca los dos; el tipo lo decide el CONTENIDO;
 *  - el orden se asigna solo y se puede cambiar; quitar el ítem suelta su archivo;
 *  - borrar la lección suelta los archivos de todo su material;
 *  - el enlace temporal de Office sirve solo para su ítem.
 *
 * Usa una lección con nombre único: `catalog_curso` es la tabla MAESTRA con el temario real.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 8);
const leccionNombre = `Guia ${marca}`;

const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(64, 1)]);
const PPTX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 2)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(64, 3)]);
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from("ftypmp42"),
  Buffer.alloc(64, 4),
]);

describe.runIf(RUN)("material guía (integración)", () => {
  let actor = "";
  let cursoId = "";
  const ids: string[] = [];

  beforeAll(async () => {
    actor =
      (
        await queryOne<{ id: string }>(
          `SELECT id FROM identity_user ORDER BY (username = 'sistema-lgs') DESC, created_at LIMIT 1`,
        )
      )?.id ?? "";
    cursoId = (
      await crearCursoReferencia({
        actorUserId: actor,
        curso: "YOUNGSTER",
        nivel: "ULTIMATE",
        unidad: "Unidad 9",
        leccion: leccionNombre,
        orden: 960,
      })
    ).id;
  });

  afterAll(async () => {
    for (const id of ids) {
      await eliminarMaterialGuia({ actorUserId: actor, id }).catch(() => undefined);
    }
    await execute(`DELETE FROM catalog_curso WHERE leccion = $1`, [leccionNombre]);
    await closePool();
  });

  const subir = async (
    tab: string,
    extra: { archivo?: { nombre: string; bytes: Buffer }; enlace?: string; titulo?: string },
  ) => {
    const r = await subirMaterialGuia({ actorUserId: actor, cursoId, tab, ...extra });
    ids.push(r.id);
    return r.id;
  };

  it("Material admite PDF y PPTX con su tipo y orden consecutivo", async () => {
    const pdf = await subir("MATERIAL", { archivo: { nombre: "Clase 1.pdf", bytes: PDF } });
    const ppt = await subir("MATERIAL", {
      archivo: { nombre: "Clase 1.pptx", bytes: PPTX },
      titulo: "Presentación con audio",
    });
    const lista = await listarMaterialGuia({ cursoId, tab: "MATERIAL" });
    expect(lista.map((i) => i.id)).toEqual([pdf, ppt]);
    expect(lista[0]).toMatchObject({ tipo: "PDF", titulo: "Clase 1", orden: 1 });
    expect(lista[1]).toMatchObject({ tipo: "PPT", titulo: "Presentación con audio", orden: 2 });
    expect(lista[1]?.archivo?.nombre).toBe("Clase 1.pptx");
    expect(lista[1]?.archivo?.mime).toContain("presentationml");
  });

  it("Recursos admite imagen, mp4 y enlace; nada cruzado entre pestañas", async () => {
    await subir("RECURSO", { archivo: { nombre: "lamina.png", bytes: PNG } });
    await subir("RECURSO", { archivo: { nombre: "cancion.mp4", bytes: MP4 } });
    await subir("RECURSO", { enlace: "https://youtu.be/abc123", titulo: "Canción" });
    const lista = await listarMaterialGuia({ cursoId, tab: "RECURSO" });
    expect(lista.map((i) => i.tipo)).toEqual(["IMAGEN", "VIDEO", "ENLACE"]);
    expect(lista[2]?.enlace).toBe("https://youtu.be/abc123");

    // Una imagen no entra en Material, un PDF no entra en Recursos.
    await expect(
      subirMaterialGuia({
        actorUserId: actor,
        cursoId,
        tab: "MATERIAL",
        archivo: { nombre: "a.png", bytes: PNG },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      subirMaterialGuia({
        actorUserId: actor,
        cursoId,
        tab: "RECURSO",
        archivo: { nombre: "a.pdf", bytes: PDF },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Los enlaces solo van en Recursos.
    await expect(
      subirMaterialGuia({ actorUserId: actor, cursoId, tab: "MATERIAL", enlace: "https://x.com" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza lo que no es lo que dice ser, el doble ítem y lo que no existe", async () => {
    await expect(
      subirMaterialGuia({
        actorUserId: actor,
        cursoId,
        tab: "MATERIAL",
        archivo: { nombre: "x.pdf", bytes: PPTX },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      subirMaterialGuia({
        actorUserId: actor,
        cursoId,
        tab: "RECURSO",
        enlace: "javascript:alert(1)",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      subirMaterialGuia({
        actorUserId: actor,
        cursoId,
        tab: "RECURSO",
        enlace: "https://x.com",
        archivo: { nombre: "a.png", bytes: PNG },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      subirMaterialGuia({ actorUserId: actor, cursoId, tab: "RECURSO" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      subirMaterialGuia({
        actorUserId: actor,
        cursoId: randomUUID(),
        tab: "RECURSO",
        enlace: "https://x.com",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      subirMaterialGuia({ actorUserId: actor, cursoId, tab: "OTRA", enlace: "https://x.com" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("editar cambia título y orden; quitar suelta el archivo", async () => {
    const id = await subir("MATERIAL", { archivo: { nombre: "Extra.pdf", bytes: PDF } });
    await editarMaterialGuia({ actorUserId: actor, id, titulo: "Guía de la clase", orden: 0 });
    const lista = await listarMaterialGuia({ cursoId, tab: "MATERIAL" });
    expect(lista[0]).toMatchObject({ id, titulo: "Guía de la clase", orden: 0 });

    const item = await archivoDeMaterialGuia(id);
    expect(item?.fileId).not.toBeNull();
    expect(await metaArchivo(item?.fileId ?? "")).not.toBeNull();
    await eliminarMaterialGuia({ actorUserId: actor, id });
    expect(await metaArchivo(item?.fileId ?? "")).toBeNull();
    expect(await archivoDeMaterialGuia(id)).toBeNull();
    await expect(eliminarMaterialGuia({ actorUserId: actor, id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it.runIf(env().AUTH_JWT_SECRET !== undefined)(
    "el enlace temporal de Office sirve solo para su ítem",
    async () => {
      const id = await subir("MATERIAL", { archivo: { nombre: "Otra.pptx", bytes: PPTX } });
      const { token } = tokenOfficeParaItem(id);
      expect(tokenOfficeValido(id, token)).toBe(true);
      expect(tokenOfficeValido(randomUUID(), token)).toBe(false);
    },
  );

  it("borrar la lección suelta los archivos de su material", async () => {
    const todos = await listarMaterialGuia({ cursoId });
    const conArchivo = (await Promise.all(todos.map((i) => archivoDeMaterialGuia(i.id)))).flatMap(
      (i) => (i?.fileId == null ? [] : [i.fileId]),
    );
    expect(conArchivo.length).toBeGreaterThan(0);

    await eliminarCursoReferencia({ actorUserId: actor, id: cursoId });
    for (const f of conArchivo) expect(await metaArchivo(f)).toBeNull();
    expect(await listarMaterialGuia({ cursoId })).toEqual([]);
  });
});
