import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eliminarArchivo, listarArchivos } from "@/modules/files";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { TooManyRequestsError, ValidationError } from "@/platform/errors";
import {
  MAX_REGISTROS_POR_IP_HORA,
  getRegistroAbierto,
  registrarGuiaAbierto,
  setRegistroAbierto,
} from "../application/registro-abierto";

/**
 * REGISTRO ABIERTO DE GUÍAS (2026-09-24): una URL fija con la que cada guía
 * crea su cuenta. Lo que se prueba aquí es lo que la sostiene —está apagada
 * por defecto, pide la clave y limita por IP—, porque es lo único que separa
 * ese enlace de una puerta abierta al panel.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 8);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const foto = () => ({ nombreOriginal: "foto.png", mime: "image/png", bytes: PNG });
const sala = () => `https://zoom.us/j/9${String(randomInt(100_000_000, 999_999_999))}`;

const datos = (n: number) => ({
  nombres: `Guia${String(n)}`,
  apellidos: `Abierta${marca}`,
  email: `guia-${marca}-${String(n)}@prueba.lgs`,
  docNumero: `cc ${marca}${String(n)}`,
  telefono: "+57 300",
  pais: "CO",
  domicilio: "Calle 1",
  fechaNacimiento: "1990-05-04",
  zoomUrl: sala(),
});

describe.runIf(RUN)("registro abierto de guías (integración)", () => {
  const creados: string[] = [];
  // IP propia por corrida: el tope se cuenta sobre la auditoría, que es común.
  const IP = `203.0.113.${String(randomInt(2, 250))}`;
  let previo: { activo: boolean; codigo: string };

  beforeAll(async () => {
    const estado = await getRegistroAbierto();
    previo = { activo: estado.activo, codigo: estado.codigo };
  });

  afterAll(async () => {
    for (const id of creados) {
      // La foto PRIMERO: no cuelga de la cuenta por clave foránea, así que
      // borrar el usuario antes la dejaría huérfana — y eso es justo lo que
      // vigila `alta-guia-integration`, que corre en paralelo.
      for (const a of await listarArchivos({ entidad: "scheduling_guia_foto", entidadId: id })) {
        await eliminarArchivo(a.id);
      }
      await execute(`DELETE FROM identity_user WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM audit_log WHERE ip = $1`, [IP]);
    // Se deja el interruptor como estaba: es configuración REAL de la instancia.
    await setRegistroAbierto({ actorUserId: ACTOR, ...previo });
    await closePool();
  });

  it("apagado, no deja registrar a nadie", async () => {
    await setRegistroAbierto({ actorUserId: ACTOR, activo: false, codigo: "" });
    await expect(
      registrarGuiaAbierto({ codigo: "", datos: datos(0), foto: foto(), ip: IP }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("con clave, una clave equivocada no entra", async () => {
    await setRegistroAbierto({ actorUserId: ACTOR, activo: true, codigo: "clave-de-prueba" });
    await expect(
      registrarGuiaAbierto({ codigo: "otra", datos: datos(1), foto: foto(), ip: IP }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Y una clave corta no se puede ni configurar.
    await expect(
      setRegistroAbierto({ actorUserId: ACTOR, activo: true, codigo: "corta" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("con la clave correcta nace la cuenta, con su rol de guía y su ficha", async () => {
    const cuenta = await registrarGuiaAbierto({
      codigo: "clave-de-prueba",
      datos: datos(2),
      foto: foto(),
      ip: IP,
    });
    creados.push(cuenta.userId);
    expect(cuenta.username.length).toBeGreaterThan(3);
    expect(cuenta.passwordInicial.length).toBeGreaterThan(5);

    const rol = await queryOne<{ code: string }>(
      `SELECT r.code FROM access_user_role ur JOIN access_role r ON r.id = ur.role_id
        WHERE ur.user_id = $1`,
      [cuenta.userId],
    );
    expect(rol?.code).toBe("guia");
    const ficha = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling_guia WHERE guia_user_id = $1`,
      [cuenta.userId],
    );
    expect(ficha?.n).toBe(1);
    // Nace obligada a cambiar la clave, como cualquier cuenta generada.
    const cta = await queryOne<{ debe: boolean }>(
      `SELECT debe_cambiar_password AS debe FROM identity_user WHERE id = $1`,
      [cuenta.userId],
    );
    expect(cta?.debe).toBe(true);
  });

  it("una URL filtrada no fabrica cuentas en serie: tope por IP", async () => {
    // Ya hay 1 registro de esta IP; se completan los que faltan hasta el tope.
    for (let i = 1; i < MAX_REGISTROS_POR_IP_HORA; i += 1) {
      const c = await registrarGuiaAbierto({
        codigo: "clave-de-prueba",
        datos: datos(10 + i),
        foto: foto(),
        ip: IP,
      });
      creados.push(c.userId);
    }
    await expect(
      registrarGuiaAbierto({ codigo: "clave-de-prueba", datos: datos(99), foto: foto(), ip: IP }),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("sin clave configurada, el enlace abre sin pedirla", async () => {
    await setRegistroAbierto({ actorUserId: ACTOR, activo: true, codigo: "" });
    const estado = await getRegistroAbierto();
    expect(estado.codigo).toBe("");
    expect(estado.enlace).toContain("/nuevo-guia");
    // Desde OTRA IP, porque la anterior ya llegó al tope.
    const cuenta = await registrarGuiaAbierto({
      codigo: "",
      datos: datos(50),
      foto: foto(),
      ip: `198.51.100.${String(randomInt(2, 250))}`,
    });
    creados.push(cuenta.userId);
    expect(cuenta.username.length).toBeGreaterThan(3);
  });
});
