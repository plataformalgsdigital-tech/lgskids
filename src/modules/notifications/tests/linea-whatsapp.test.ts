import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CABECERA_FALLA_ENVIO,
  conCapturaDeFalla,
  fallaParaCabecera,
  notificarFalla,
} from "@/platform/http/falla-envio";

/**
 * La línea de WhatsApp de KIDS: sigue el canal que LGS elige en Contingencia, informa
 * si está viva y, cuando un envío falla, deja la causa para el modal de la pantalla.
 * `fetch` va simulado: ni LGS ni Whapi se tocan.
 */
const PROPIO = "token-propio-de-kids-1234567890";
const DE_LGS = "token-del-canal-a-de-lgs-1234567890";

interface Llamada {
  url: string;
  auth: string | null;
}
let llamadas: Llamada[];

function simular(opciones: {
  lgs: "ok" | "caido";
  salud: { code: number; text: string } | "error";
}) {
  llamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      llamadas.push({ url, auth: headers.authorization ?? headers["x-api-key"] ?? null });
      if (url.includes("/api/kids-sync/whatsapp")) {
        return opciones.lgs === "ok"
          ? Promise.resolve(Response.json({ canal: "A", numero: "+56 9 5770 3724", token: DE_LGS }))
          : Promise.reject(new Error("LGS no responde"));
      }
      if (url.includes("/health")) {
        return opciones.salud === "error"
          ? Promise.reject(new Error("sin red"))
          : Promise.resolve(Response.json({ status: opciones.salud }));
      }
      return Promise.resolve(Response.json({}));
    }),
  );
}

describe("línea de WhatsApp de KIDS", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("WHAPI_TOKEN", PROPIO);
    vi.stubEnv("LGS_API_URL", "https://lgs.ejemplo.test");
    vi.stubEnv("LGS_INTAKE_API_KEY", "clave-de-servicio-de-prueba");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sigue el canal de Contingencia de LGS y, autenticada, está ACTIVA", async () => {
    simular({ lgs: "ok", salud: { code: 4, text: "AUTH" } });
    const { estadoLinea } = await import("../infrastructure/linea-whatsapp");
    const e = await estadoLinea();
    expect(e.estado).toBe("ACTIVA");
    expect(e.canal).toBe("A");
    expect(e.numero).toBe("+56 9 5770 3724");
    // Consultó la salud del canal de LGS, no la del token propio.
    expect(llamadas.find((l) => l.url.includes("/health"))?.auth).toBe(`Bearer ${DE_LGS}`);
  });

  it("sesión desconectada (QR) = CAIDA, con la causa", async () => {
    simular({ lgs: "ok", salud: { code: 3, text: "QR" } });
    const { estadoLinea, mensajeLineaCaida } = await import("../infrastructure/linea-whatsapp");
    const e = await estadoLinea();
    expect(e.estado).toBe("CAIDA");
    expect(e.causa).toContain("QR");
    const aviso = mensajeLineaCaida(e);
    expect(aviso).toContain("Servicio LGS");
    expect(aviso).toContain("Causa:");
  });

  it("si LGS no responde, usa el token propio y no se queda mudo", async () => {
    simular({ lgs: "caido", salud: { code: 4, text: "AUTH" } });
    const { canalActual, estadoLinea } = await import("../infrastructure/linea-whatsapp");
    const c = await canalActual();
    expect(c?.origen).toBe("PROPIO");
    expect(c?.token).toBe(PROPIO);
    expect((await estadoLinea()).estado).toBe("ACTIVA");
  });

  it("si no se puede consultar la línea, se informa como CAIDA", async () => {
    simular({ lgs: "ok", salud: "error" });
    const { estadoLinea } = await import("../infrastructure/linea-whatsapp");
    const e = await estadoLinea();
    expect(e.estado).toBe("CAIDA");
    expect(e.causa).toContain("no se pudo consultar");
  });

  it("sin proveedor de WhatsApp (desarrollo) es SIMULADA, no caída", async () => {
    vi.stubEnv("WHAPI_TOKEN", undefined);
    simular({ lgs: "ok", salud: { code: 4, text: "AUTH" } });
    const { estadoLinea } = await import("../infrastructure/linea-whatsapp");
    expect((await estadoLinea()).estado).toBe("SIMULADA");
  });
});

describe("falla de envío dentro de una petición", () => {
  it("queda anotada para la cabecera, solo la primera, y fuera de una petición no hace nada", async () => {
    expect(CABECERA_FALLA_ENVIO).toBe("x-whatsapp-falla");
    notificarFalla("fuera de la petición"); // no lanza
    expect(fallaParaCabecera()).toBeUndefined();

    const valor = await conCapturaDeFalla(async () => {
      expect(fallaParaCabecera()).toBeUndefined();
      notificarFalla("La línea está caída. Causa: QR");
      notificarFalla("otra falla posterior");
      return fallaParaCabecera();
    });
    expect(decodeURIComponent(valor ?? "")).toBe("La línea está caída. Causa: QR");
  });
});
