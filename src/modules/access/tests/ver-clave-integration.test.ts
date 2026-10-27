import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ForbiddenError } from "@/platform/errors";
import { getAccessProfile } from "../application/get-access-profile";
import {
  actualizarPermisosDeRol,
  crearRol,
  exigirPuedeOtorgarRol,
} from "../application/gestionar-roles";

/**
 * INTEGRACIÓN: «Ver clave» como permiso marcable (2026-10-27). Lo que importa
 * son los frenos: quien NO es superadmin no lo marca en un rol (ni siquiera
 * teniendo `roles.asignar`) ni otorga un rol que lo tenga.
 *
 * Usa las cuentas `admin` y `superadmin` del seed (CI lo corre).
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

describe.runIf(RUN)("permiso «Ver clave» (integración)", () => {
  let admin: string;
  let superadmin: string;
  let rol: string;

  const id = async (username: string) =>
    (await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = $1`, [username]))
      ?.id as string;

  beforeAll(async () => {
    admin = await id("admin");
    superadmin = await id("superadmin");
    rol = (
      await crearRol({ actorUserId: superadmin, nombre: `IT Clave ${randomUUID().slice(0, 6)}` })
    ).code;
  });

  afterAll(async () => {
    await execute(
      `DELETE FROM access_role_permission WHERE role_id = (SELECT id FROM access_role WHERE code = $1)`,
      [rol],
    );
    await execute(`DELETE FROM access_role WHERE code = $1`, [rol]);
    await closePool();
  });

  it("solo un superadmin lo marca, lo quita y otorga un rol que lo tenga", async () => {
    // Un admin edita el rol, pero no puede ponerle «Ver clave».
    await actualizarPermisosDeRol({
      actorUserId: admin,
      roleCode: rol,
      permisos: ["personas.ver"],
    });
    await expect(
      actualizarPermisosDeRol({
        actorUserId: admin,
        roleCode: rol,
        permisos: ["personas.ver", "usuarios.ver_clave"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // El superadmin sí.
    await actualizarPermisosDeRol({
      actorUserId: superadmin,
      roleCode: rol,
      permisos: ["personas.ver", "usuarios.ver_clave"],
    });

    // Con el permiso ya puesto, el admin no puede otorgar ese rol ni quitárselo.
    await expect(exigirPuedeOtorgarRol(await getAccessProfile(admin), rol)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      actualizarPermisosDeRol({ actorUserId: admin, roleCode: rol, permisos: ["personas.ver"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Pero puede seguir editando lo demás del rol sin tocar «Ver clave».
    await actualizarPermisosDeRol({
      actorUserId: admin,
      roleCode: rol,
      permisos: ["personas.ver", "contratos.ver", "usuarios.ver_clave"],
    });
    await expect(
      exigirPuedeOtorgarRol(await getAccessProfile(superadmin), rol),
    ).resolves.toBeUndefined();
  });
});
