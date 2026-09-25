import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eliminarArchivo } from "@/modules/files";
import { listarUsuarios } from "@/modules/identity";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import { crearGuia } from "../application/alta-guia";
import { guardarFichaGuia } from "../application/crear-evento";

/**
 * ALTA DEL GUÍA desde Gestión de Usuarios (2026-09-22): cuenta + rol + ficha +
 * foto en un paso, o cuenta + enlace para que él complete su ficha.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 8);
// PNG de 1×1: basta para que `files` lo acepte como imagen.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const foto = () => ({ nombreOriginal: "foto.png", mime: "image/png", bytes: PNG });
const sala = () => `https://zoom.us/j/9${String(randomInt(100_000_000, 999_999_999))}`;

/**
 * ¿Quedó en `files` una foto con ESTE nombre?
 *
 * Antes se contaban todas las fotos de guía de la tabla y se comparaba el
 * total antes/después. Eso se volvió inestable en cuanto otros archivos de
 * pruebas empezaron a crear y borrar guías con foto en paralelo —vitest corre
 * los archivos a la vez—: el total cambiaba por razones ajenas y CI falló con
 * "expected 2 to be 1". Mirar el nombre ÚNICO de la foto de esta prueba mide
 * el mismo invariante ("el alta fallida soltó su foto") sin depender de lo que
 * hagan los demás.
 */
async function fotosConNombre(nombre: string): Promise<number> {
  const fila = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM files_object WHERE nombre_original = $1`,
    [nombre],
  );
  return fila?.n ?? 0;
}

describe.runIf(RUN)("alta del guía (integración)", () => {
  const creados: string[] = [];
  const fotos: string[] = [];
  let guia: { userId: string; username: string };
  let zoom: string;

  afterAll(async () => {
    for (const id of creados) await execute(`DELETE FROM identity_user WHERE id = $1`, [id]);
    for (const id of fotos) await eliminarArchivo(id);
    await closePool();
  });

  it("COMPLETO: cuenta con rol guía global, ficha y foto de una vez", async () => {
    zoom = sala();
    guia = await crearGuia({
      actorUserId: ACTOR,
      datos: {
        nombres: "Laura",
        apellidos: "Montoya",
        email: `laura-${marca}@prueba.lgs`,
        docNumero: "cc 55",
        telefono: "+57 300",
        pais: "CO",
        domicilio: "Calle 1",
        fechaNacimiento: "1990-05-04",
        zoomUrl: zoom,
      },
      foto: foto(),
    });
    creados.push(guia.userId);

    const ficha = await queryOne<{ doc: string; foto: string | null; pais: string }>(
      `SELECT doc_numero AS doc, foto_file_id AS foto, pais FROM scheduling_guia
        WHERE guia_user_id = $1`,
      [guia.userId],
    );
    expect(ficha?.doc).toBe("CC 55");
    expect(ficha?.foto).not.toBeNull();
    fotos.push(ficha?.foto ?? "");

    const [fila] = await listarUsuarios({ buscar: guia.username });
    expect(fila).toMatchObject({ tipo: "guia", persona: "Laura Montoya" });
    expect(fila?.roles).toEqual([{ rol: "guia", pais: null }]);
    // Su ficha es la del guía: no se duplica en la del administrativo.
    const perfil = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM identity_perfil WHERE user_id = $1`,
      [guia.userId],
    );
    expect(perfil?.n).toBe(0);
  });

  it("editar la ficha sin mandar la foto la CONSERVA (antes la borraba)", async () => {
    await guardarFichaGuia({
      actorUserId: ACTOR,
      guiaUserId: guia.userId,
      nombres: "Laura",
      apellidos: "Montoya Ríos",
      zoomUrl: zoom,
    });
    const ficha = await queryOne<{ foto: string | null }>(
      `SELECT foto_file_id AS foto FROM scheduling_guia WHERE guia_user_id = $1`,
      [guia.userId],
    );
    expect(ficha?.foto).toBe(fotos[0]);
  });

  it("si la ficha falla (sala de Zoom ajena) no queda cuenta ni foto sueltas", async () => {
    const email = `otro-${marca}@prueba.lgs`;
    // Nombre único: así se puede comprobar que se soltó ESTA foto y no otra.
    const nombreFoto = `fallida-${marca}.png`;
    await expect(
      crearGuia({
        actorUserId: ACTOR,
        datos: { nombres: "Otro", apellidos: "Guía", email, docNumero: "9", zoomUrl: zoom },
        foto: { ...foto(), nombreOriginal: nombreFoto },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const cuenta = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM identity_user WHERE email = $1`,
      [email],
    );
    expect(cuenta?.n).toBe(0);
    expect(await fotosConNombre(nombreFoto)).toBe(0);
  });

  it("COMPLETO exige foto y documento; CON ENLACE basta nombre, apellido y correo", async () => {
    await expect(
      crearGuia({
        actorUserId: ACTOR,
        datos: {
          nombres: "Sin",
          apellidos: "Foto",
          email: `sf-${marca}@prueba.lgs`,
          docNumero: "",
        },
        foto: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // El enlace guarda QUIÉN lo emitió (clave foránea): hace falta un actor real.
    const admin = await queryOne<{ id: string }>(
      `SELECT id FROM identity_user WHERE username = 'admin'`,
    );
    const conEnlace = await crearGuia({
      actorUserId: admin?.id ?? ACTOR,
      datos: {
        nombres: "Pedro",
        apellidos: "Salas",
        email: `ps-${marca}@prueba.lgs`,
        docNumero: "",
      },
      foto: null,
      enviarEnlace: true,
    });
    creados.push(conEnlace.userId);
    expect(conEnlace.enlace?.enlace).toContain("/nuevo-guia");
    const vivo = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling_guia_invitacion
        WHERE guia_user_id = $1 AND usado_en IS NULL AND revocado_en IS NULL`,
      [conEnlace.userId],
    );
    expect(vivo?.n).toBe(1);
  });
});
