import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { TooManyRequestsError } from "@/platform/errors";
import { crearUsuarioStaff } from "../application/crear-usuario";
import {
  consultarClave,
  fijarDebeCambiarClave,
  restablecerClave,
} from "../application/gestion-cuentas";
import { listarUsuarios } from "../application/listar-usuarios";
import {
  MAX_SOLICITUDES_POR_IP_HORA,
  descartarSolicitudClave,
  listarSolicitudesClave,
  registrarSolicitudClave,
} from "../application/solicitudes-clave";
import { Argon2Hasher } from "../infrastructure/argon2-hasher";
import { sessionService } from "../infrastructure/composition";

const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
// La consulta de claves necesita la llave de la bóveda (CI la define; en local
// puede faltar, como AUTH_JWT_SECRET en la prueba de sesión).
const BOVEDA = env().PASSWORD_VAULT_KEY !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const IP = `prueba-${randomUUID().slice(0, 8)}`;

describe.runIf(RUN)("cuentas de usuario (integración)", () => {
  const creados: string[] = [];
  let cuenta: { userId: string; username: string; passwordInicial: string };

  afterAll(async () => {
    // El borrado arrastra (ON DELETE CASCADE) roles, ficha, sesiones y solicitudes.
    for (const id of creados) await execute(`DELETE FROM identity_user WHERE id = $1`, [id]);
    await execute(`DELETE FROM identity_solicitud_clave WHERE ip = $1`, [IP]);
    await closePool();
  });

  it("el usuario del staff se GENERA de sus nombres, y la ficha guarda quién es", async () => {
    cuenta = await crearUsuarioStaff({
      actorUserId: ACTOR,
      nombres: "Camilo Andrés",
      apellidos: "Gamboa Ríos",
      telefono: "+57 300 000 0000",
      roleCode: "guia",
      countryCode: "CO",
    });
    creados.push(cuenta.userId);
    expect(cuenta.username).toMatch(/^cgamboa\d{4}$/);

    const [fila] = await listarUsuarios({ buscar: cuenta.username });
    expect(fila?.persona).toBe("Camilo Andrés Gamboa Ríos");
    expect(fila?.debeCambiarPassword).toBe(true);
    expect(fila?.roles).toEqual([{ rol: "guia", pais: "CO" }]);
    expect(fila?.tieneCopiaClave).toBe(BOVEDA);
  });

  it("dos altas con el MISMO nombre nunca repiten usuario", async () => {
    const otra = await crearUsuarioStaff({
      actorUserId: ACTOR,
      nombres: "Camilo",
      apellidos: "Gamboa",
    });
    creados.push(otra.userId);
    expect(otra.username).toMatch(/^cgamboa\d{4}$/);
    expect(otra.username).not.toBe(cuenta.username);
  });

  it.runIf(BOVEDA)("el superadmin puede consultar la clave generada", async () => {
    expect(await consultarClave({ actorUserId: ACTOR, userId: cuenta.userId })).toEqual({
      clave: cuenta.passwordInicial,
    });
  });

  it("RESTABLECER: clave nueva, la vieja deja de servir, sesiones cerradas y solicitud atendida", async () => {
    await registrarSolicitudClave({ usuario: cuenta.username, contacto: "WhatsApp", ip: IP });
    await execute(
      `INSERT INTO identity_refresh_token (id, user_id, token_hash, family_id, expira_en)
       VALUES ($1, $2, $3, $4, now() + interval '1 day')`,
      [randomUUID(), cuenta.userId, randomUUID(), randomUUID()],
    );
    await fijarDebeCambiarClave({ actorUserId: ACTOR, userId: cuenta.userId, valor: false });

    const { clave } = await restablecerClave({ actorUserId: ACTOR, userId: cuenta.userId });
    expect(clave).not.toBe(cuenta.passwordInicial);

    const fila = await queryOne<{ hash: string; debe: boolean }>(
      `SELECT password_hash AS hash, debe_cambiar_password AS debe FROM identity_user WHERE id = $1`,
      [cuenta.userId],
    );
    const hasher = new Argon2Hasher();
    expect(await hasher.verify(clave, fila?.hash ?? "")).toBe(true);
    expect(await hasher.verify(cuenta.passwordInicial, fila?.hash ?? "")).toBe(false);
    expect(fila?.debe).toBe(true); // tendrá que cambiarla al entrar

    const vivas = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM identity_refresh_token WHERE user_id = $1 AND revocado_en IS NULL`,
      [cuenta.userId],
    );
    expect(vivas?.n).toBe(0);
    const pendientes = await listarSolicitudesClave();
    expect(pendientes.some((s) => s.userId === cuenta.userId)).toBe(false);

    if (BOVEDA) {
      expect(await consultarClave({ actorUserId: ACTOR, userId: cuenta.userId })).toEqual({
        clave,
      });
    }
    cuenta = { ...cuenta, passwordInicial: clave };
  });

  it.runIf(BOVEDA)("también la clave que elige el propio usuario queda consultable", async () => {
    await sessionService().changePassword({
      userId: cuenta.userId,
      passwordActual: cuenta.passwordInicial,
      passwordNueva: "MiClaveNueva2026",
      ip: IP,
    });
    expect(await consultarClave({ actorUserId: ACTOR, userId: cuenta.userId })).toEqual({
      clave: "MiClaveNueva2026",
    });
  });

  it("una cuenta SIN copia lo dice en vez de fallar", async () => {
    await execute(`UPDATE identity_user SET password_cifrada = NULL WHERE id = $1`, [
      cuenta.userId,
    ]);
    const r = await consultarClave({ actorUserId: ACTOR, userId: cuenta.userId });
    expect(r.clave).toBeNull();
    expect(r).toHaveProperty("motivo", BOVEDA ? "SIN_COPIA" : "BOVEDA_APAGADA");
  });

  it("OLVIDÉ MI CLAVE: una sola pendiente por cuenta; un usuario inexistente también se registra", async () => {
    await registrarSolicitudClave({ usuario: cuenta.username, ip: IP });
    await registrarSolicitudClave({
      usuario: cuenta.username.toUpperCase(),
      contacto: "300",
      ip: IP,
    });
    const mias = (await listarSolicitudesClave()).filter((s) => s.userId === cuenta.userId);
    expect(mias).toHaveLength(1);
    expect(mias[0]?.contacto).toBe("300");

    await registrarSolicitudClave({ usuario: "no-existe-nadie", ip: IP });
    const fantasma = (await listarSolicitudesClave()).find(
      (s) => s.usuarioIngresado === "no-existe-nadie",
    );
    expect(fantasma?.userId).toBeNull();
    await descartarSolicitudClave({ actorUserId: ACTOR, id: fantasma?.id ?? "" });
  });

  it("la puerta pública frena a quien insiste desde la misma IP", async () => {
    const ip = `prueba-limite-${randomUUID().slice(0, 8)}`;
    try {
      for (let i = 0; i < MAX_SOLICITUDES_POR_IP_HORA; i += 1) {
        await registrarSolicitudClave({ usuario: `nadie-${String(i)}`, ip });
      }
      await expect(registrarSolicitudClave({ usuario: "uno-mas", ip })).rejects.toBeInstanceOf(
        TooManyRequestsError,
      );
    } finally {
      await execute(`DELETE FROM identity_solicitud_clave WHERE ip = $1`, [ip]);
    }
  });
});
