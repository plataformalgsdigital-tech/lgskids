import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eliminarArchivo, listarArchivos, metaArchivo, subirArchivo } from "@/modules/files";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { descargarImagenCurso } from "../application/imagen-curso";
import {
  archivoDeMaterial,
  eliminarMaterial,
  estadoMaterial,
  materialVigente,
  setPrefijoMaterialParaPruebas,
  subirMaterial,
} from "../application/material";

const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
// Prefijo propio: la clave JUNIOR:ROOKIE es la del libro REAL en la base de
// desarrollo, y "reemplazarlo" aquí lo borraría.
const PREFIJO = `prueba_material_${randomUUID().slice(0, 8)}`;

const HTML = (marca: string) =>
  Buffer.from(`<!doctype html><html><head><title>${marca}</title></head><body></body></html>`);
const PDF = Buffer.from("%PDF-1.7\n% libro de prueba\n");

describe.runIf(RUN)("material del alumno (integración)", () => {
  const sueltos: string[] = [];

  beforeAll(() => setPrefijoMaterialParaPruebas(PREFIJO));

  afterAll(async () => {
    // Filas Y bytes: dejar 2 libros de prueba en disco por corrida se acumula.
    for (const tipo of ["interactivo", "imprimible"]) {
      for (const a of await listarArchivos({ entidad: `${PREFIJO}_${tipo}`, limit: 200 })) {
        await eliminarArchivo(a.id);
      }
    }
    for (const id of sueltos) await eliminarArchivo(id);
    setPrefijoMaterialParaPruebas("catalog_material");
    // El pool se cierra UNA vez, en el último bloque del archivo.
  });

  it("sube el libro interactivo de un nivel y lo reconoce como material", async () => {
    const { id } = await subirMaterial({
      actorUserId: ACTOR,
      tipo: "interactivo",
      curso: "JUNIOR",
      nivel: "ROOKIE",
      nombreOriginal: "Rookie_v1.html",
      bytes: HTML("v1"),
    });
    expect((await materialVigente("interactivo", "JUNIOR", "ROOKIE"))?.id).toBe(id);
    expect(await archivoDeMaterial(id)).toEqual({
      tipo: "interactivo",
      curso: "JUNIOR",
      nivel: "ROOKIE",
      nombreOriginal: "Rookie_v1.html",
    });
    const estado = await estadoMaterial();
    expect(estado["JUNIOR"]?.find((n) => n.nivel === "ROOKIE")?.interactivo?.id).toBe(id);
    expect(estado["YOUNGSTER"]).toHaveLength(5);
  });

  it("REEMPLAZAR suelta el anterior: fila y bytes, no un huérfano de 30 MB", async () => {
    const viejo = await materialVigente("interactivo", "JUNIOR", "ROOKIE");
    const { id } = await subirMaterial({
      actorUserId: ACTOR,
      tipo: "interactivo",
      curso: "JUNIOR",
      nivel: "ROOKIE",
      nombreOriginal: "Rookie_v2.html",
      bytes: HTML("v2"),
    });
    expect((await materialVigente("interactivo", "JUNIOR", "ROOKIE"))?.id).toBe(id);
    expect(viejo).not.toBeNull();
    expect(await metaArchivo(viejo?.id ?? "")).toBeNull();
    const filas = await listarArchivos({
      entidad: `${PREFIJO}_interactivo`,
      entidadId: "JUNIOR:ROOKIE",
    });
    expect(filas).toHaveLength(1);
  });

  it("el tipo lo decide el CONTENIDO, no la extensión", async () => {
    const base = { actorUserId: ACTOR, curso: "JUNIOR", nivel: "CHAMPION" };
    await expect(
      subirMaterial({ ...base, tipo: "interactivo", nombreOriginal: "libro.html", bytes: PDF }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      subirMaterial({ ...base, tipo: "imprimible", nombreOriginal: "libro.pdf", bytes: HTML("x") }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      subirMaterial({ ...base, tipo: "imprimible", nombreOriginal: "libro.html", bytes: PDF }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("solo niveles y cursos reales: no hay libro 'TODOS'", async () => {
    const base = { actorUserId: ACTOR, tipo: "imprimible" as const, nombreOriginal: "l.pdf" };
    await expect(
      subirMaterial({ ...base, curso: "JUNIOR", nivel: "TODOS", bytes: PDF }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      subirMaterial({ ...base, curso: "ADULTOS", nivel: "ROOKIE", bytes: PDF }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("un archivo que NO es material no se sirve como material", async () => {
    const { id } = await subirArchivo({
      actorUserId: ACTOR,
      nombreOriginal: "contrato.pdf",
      mime: "application/pdf",
      bytes: PDF,
      entidad: "contracts_contract",
      entidadId: "JUNIOR:ROOKIE", // aunque la clave coincida
    });
    sueltos.push(id);
    expect(await archivoDeMaterial(id)).toBeNull();
    expect(await archivoDeMaterial(randomUUID())).toBeNull();
  });

  it("la ruta del ARTE no sirve el HTML del libro: fuera de su caja sería un ataque", async () => {
    const libro = await materialVigente("interactivo", "JUNIOR", "ROOKIE");
    await expect(descargarImagenCurso(libro?.id ?? "")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("sube el PDF y quitarlo borra el material del nivel", async () => {
    await subirMaterial({
      actorUserId: ACTOR,
      tipo: "imprimible",
      curso: "YOUNGSTER",
      nivel: "ELITE",
      nombreOriginal: "Elite.pdf",
      bytes: PDF,
    });
    expect(await materialVigente("imprimible", "YOUNGSTER", "ELITE")).not.toBeNull();
    const r = await eliminarMaterial({
      actorUserId: ACTOR,
      tipo: "imprimible",
      curso: "YOUNGSTER",
      nivel: "ELITE",
    });
    expect(r.eliminados).toBe(1);
    expect(await materialVigente("imprimible", "YOUNGSTER", "ELITE")).toBeNull();
  });
});

describe.runIf(RUN)("files: política de subida por llamada", () => {
  afterAll(async () => {
    await closePool();
  });

  it("sin política, el HTML sigue prohibido: la excepción es SOLO del material", async () => {
    await expect(
      subirArchivo({
        actorUserId: ACTOR,
        nombreOriginal: "x.html",
        mime: "text/html",
        bytes: HTML("x"),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("con política, manda su tope: 11 MB entra por el material y no por la general", async () => {
    const grande = Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024, 0x20)]);
    await expect(
      subirArchivo({
        actorUserId: ACTOR,
        nombreOriginal: "grande.pdf",
        mime: "application/pdf",
        bytes: grande,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const { id } = await subirArchivo({
      actorUserId: ACTOR,
      nombreOriginal: "grande.pdf",
      mime: "application/pdf",
      bytes: grande,
      politica: { mimes: new Map([["application/pdf", "pdf"]]), tamanoMaximo: 20 * 1024 * 1024 },
    });
    expect((await metaArchivo(id))?.sizeBytes).toBe(grande.length);
    await eliminarArchivo(id);
  });
});
