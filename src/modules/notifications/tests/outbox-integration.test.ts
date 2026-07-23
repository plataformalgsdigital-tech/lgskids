import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { encolarNotificacion, procesarOutbox, setSenderForTests } from "../index";
import type { MensajeSaliente } from "../application/ports";

const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const sufijo = Math.random().toString(36).slice(2, 8);
const DESTINO = `+57300${sufijo}`;

describe.runIf(RUN)("outbox de notificaciones (integración)", () => {
  const enviados: MensajeSaliente[] = [];
  let fallar = false;

  beforeEach(() => {
    enviados.length = 0;
    setSenderForTests({
      enviar: async (mensaje) => {
        if (fallar) return { ok: false, error: "proveedor caído (simulado)" };
        enviados.push(mensaje);
        return { ok: true };
      },
    });
  });

  afterAll(async () => {
    setSenderForTests(null);
    await execute(`DELETE FROM notifications_outbox WHERE destinatario = $1`, [DESTINO]);
    await closePool();
  });

  it("encola y el worker despacha", async () => {
    const id = await encolarNotificacion({
      canal: "WHATSAPP",
      destinatario: DESTINO,
      mensaje: "🏅 Mensaje de prueba",
    });
    const resultado = await procesarOutbox();
    expect(resultado.enviadas).toBeGreaterThanOrEqual(1);
    expect(enviados.some((m) => m.destinatario === DESTINO)).toBe(true);

    const fila = await queryOne<{ estado: string; intentos: number }>(
      `SELECT estado::text AS estado, intentos FROM notifications_outbox WHERE id = $1`,
      [id],
    );
    expect(fila?.estado).toBe("ENVIADA");
    expect(fila?.intentos).toBe(1);
  });

  it("el fallo del proveedor NO pierde el mensaje: queda FALLIDA y se reintenta", async () => {
    fallar = true;
    const id = await encolarNotificacion({
      canal: "WHATSAPP",
      destinatario: DESTINO,
      mensaje: "reintento de prueba",
    });
    await procesarOutbox();
    let fila = await queryOne<{ estado: string; intentos: number; ultimo_error: string }>(
      `SELECT estado::text AS estado, intentos, ultimo_error FROM notifications_outbox WHERE id = $1`,
      [id],
    );
    expect(fila?.estado).toBe("FALLIDA");
    expect(fila?.ultimo_error).toContain("simulado");

    // El proveedor vuelve: el siguiente ciclo la envía.
    fallar = false;
    await procesarOutbox();
    fila = await queryOne(
      `SELECT estado::text AS estado, intentos, ultimo_error FROM notifications_outbox WHERE id = $1`,
      [id],
    );
    expect(fila?.estado).toBe("ENVIADA");
    expect(fila?.intentos).toBe(2);
  });
});
