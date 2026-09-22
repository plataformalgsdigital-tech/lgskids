import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { quitarRol } from "@/modules/access";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { crearUsuarioStaff } from "../application/crear-usuario";
import {
  actualizarFichaAdministrativo,
  cambiarEstadoCuenta,
  eliminarCuenta,
} from "../application/gestion-cuentas";
import { listarUsuarios } from "../application/listar-usuarios";

/**
 * Gestión de usuarios por TIPO (2026-09-22): ficha del administrativo, correo
 * que no se repite, inactivar/reactivar, borrar solo sin historia y quitar rol.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 8);
const correo = (n: string) => `${n}-${marca}@prueba.lgs`;

describe.runIf(RUN)("gestión de usuarios por tipo (integración)", () => {
  const creados: string[] = [];
  let admin: { userId: string; username: string };

  afterAll(async () => {
    for (const id of creados) await execute(`DELETE FROM identity_user WHERE id = $1`, [id]);
    await closePool();
  });

  it("el administrativo nace con su ficha completa y se lista como tal", async () => {
    admin = await crearUsuarioStaff({
      actorUserId: ACTOR,
      nombres: "Marcela",
      apellidos: "Quintero",
      email: correo("MQuintero"),
      telefono: "+57 310 000 0000",
      docNumero: "cc 1020",
      roleCode: "coordinador",
      countryCode: "CO",
    });
    creados.push(admin.userId);

    const [fila] = await listarUsuarios({ buscar: admin.username });
    expect(fila).toMatchObject({
      tipo: "administrativo",
      persona: "Marcela Quintero",
      email: correo("mquintero"), // se guarda en minúsculas
      telefono: "+57 310 000 0000",
      docNumero: "CC 1020",
      motivosNoBorrar: [],
    });
    // El filtro por tipo lo encuentra; el de guías, no.
    expect((await listarUsuarios({ buscar: admin.username, tipo: "administrativo" })).length).toBe(
      1,
    );
    expect((await listarUsuarios({ buscar: admin.username, tipo: "guia" })).length).toBe(0);
    // También se encuentra por documento.
    expect((await listarUsuarios({ buscar: "CC 1020" })).some((u) => u.id === admin.userId)).toBe(
      true,
    );
  });

  it("un correo real no se repite (sin importar mayúsculas)", async () => {
    await expect(
      crearUsuarioStaff({
        actorUserId: ACTOR,
        nombres: "Otra",
        apellidos: "Persona",
        email: correo("MQUINTERO"),
        roleCode: "coordinador",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("editar la ficha del administrativo, sin robarle el correo a otro", async () => {
    const otro = await crearUsuarioStaff({
      actorUserId: ACTOR,
      nombres: "Julián",
      apellidos: "Rey",
      email: correo("jrey"),
    });
    creados.push(otro.userId);

    await actualizarFichaAdministrativo({
      actorUserId: ACTOR,
      userId: admin.userId,
      nombres: "Marcela Andrea",
      apellidos: "Quintero",
      email: correo("marcela"),
      telefono: null,
      docNumero: "1020",
    });
    const [fila] = await listarUsuarios({ buscar: admin.username });
    expect(fila?.persona).toBe("Marcela Andrea Quintero");
    expect(fila?.email).toBe(correo("marcela"));
    expect(fila?.telefono).toBeNull();

    await expect(
      actualizarFichaAdministrativo({
        actorUserId: ACTOR,
        userId: admin.userId,
        nombres: "Marcela",
        apellidos: "Quintero",
        email: correo("jrey"),
        telefono: null,
        docNumero: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("INACTIVAR cierra sus sesiones y REACTIVAR la devuelve; nadie se inactiva a sí mismo", async () => {
    await execute(
      `INSERT INTO identity_refresh_token (id, user_id, token_hash, family_id, expira_en)
       VALUES ($1, $2, $3, $4, now() + interval '1 day')`,
      [randomUUID(), admin.userId, randomUUID(), randomUUID()],
    );
    await cambiarEstadoCuenta({ actorUserId: ACTOR, userId: admin.userId, estado: "INACTIVO" });
    const tras = await queryOne<{ estado: string; vivas: number }>(
      `SELECT u.estado::text AS estado,
              (SELECT count(*)::int FROM identity_refresh_token t
                WHERE t.user_id = u.id AND t.revocado_en IS NULL) AS vivas
         FROM identity_user u WHERE u.id = $1`,
      [admin.userId],
    );
    expect(tras).toEqual({ estado: "INACTIVO", vivas: 0 });

    await cambiarEstadoCuenta({ actorUserId: ACTOR, userId: admin.userId, estado: "ACTIVO" });
    const [fila] = await listarUsuarios({ buscar: admin.username, estado: "ACTIVO" });
    expect(fila?.id).toBe(admin.userId);

    await expect(
      cambiarEstadoCuenta({ actorUserId: admin.userId, userId: admin.userId, estado: "INACTIVO" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("BORRAR: solo la cuenta sin historia; la que ya entró se inactiva", async () => {
    await execute(`UPDATE identity_user SET ultimo_login_en = now() WHERE id = $1`, [admin.userId]);
    const [fila] = await listarUsuarios({ buscar: admin.username });
    expect(fila?.motivosNoBorrar).toEqual(["ya entró a la plataforma"]);
    await expect(eliminarCuenta({ actorUserId: ACTOR, userId: admin.userId })).rejects.toThrow(
      /ya entró a la plataforma/,
    );

    const error = await crearUsuarioStaff({
      actorUserId: ACTOR,
      nombres: "Creado",
      apellidos: "PorError",
      email: correo("error"),
      roleCode: "coordinador",
    });
    await eliminarCuenta({ actorUserId: ACTOR, userId: error.userId });
    const queda = await queryOne<{ n: number }>(
      `SELECT (SELECT count(*) FROM identity_user WHERE id = $1)::int
            + (SELECT count(*) FROM identity_perfil WHERE user_id = $1)::int
            + (SELECT count(*) FROM access_user_role WHERE user_id = $1)::int AS n`,
      [error.userId],
    );
    expect(queda?.n).toBe(0); // la ficha y el rol se fueron con ella
  });

  it("QUITAR ROL: con el mismo alcance; nunca el propio, el de alumno ni la última llave maestra", async () => {
    await quitarRol({
      actorUserId: ACTOR,
      userId: admin.userId,
      roleCode: "coordinador",
      countryCode: "CO",
    });
    const [fila] = await listarUsuarios({ buscar: admin.username });
    expect(fila?.roles).toEqual([]);
    await expect(
      quitarRol({
        actorUserId: ACTOR,
        userId: admin.userId,
        roleCode: "coordinador",
        countryCode: "CO",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      quitarRol({
        actorUserId: admin.userId,
        userId: admin.userId,
        roleCode: "admin",
        countryCode: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      quitarRol({
        actorUserId: ACTOR,
        userId: admin.userId,
        roleCode: "alumno",
        countryCode: "CO",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Si este fuera el ÚNICO superadmin activo, no se le podría quitar.
    const supers = await queryOne<{ n: number }>(
      `SELECT count(DISTINCT ur.user_id)::int AS n
         FROM access_user_role ur JOIN access_role r ON r.id = ur.role_id
         JOIN identity_user u ON u.id = ur.user_id
        WHERE r.code = 'superadmin' AND u.estado = 'ACTIVO'`,
    );
    if ((supers?.n ?? 0) === 0) {
      await execute(
        `INSERT INTO access_user_role (id, user_id, role_id, country_code)
         SELECT $1, $2, id, NULL FROM access_role WHERE code = 'superadmin'`,
        [randomUUID(), admin.userId],
      );
      await expect(
        quitarRol({
          actorUserId: ACTOR,
          userId: admin.userId,
          roleCode: "superadmin",
          countryCode: null,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    }
  });
});
