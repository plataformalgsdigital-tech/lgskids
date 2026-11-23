import { env } from "@/platform/config/env";
import { logger } from "@/platform/logging/logger";

/**
 * LA LÍNEA DE WHATSAPP de KIDS: por cuál número sale lo de la plataforma y si ese
 * número está vivo.
 *
 * - **Cuál**: lo decide LGS en Mantenimiento › Contingencia (tipo "Mensajes de KIDS").
 *   KIDS se lo pregunta a `GET {LGS_API_URL}/api/kids-sync/whatsapp` y lo recuerda 60 s,
 *   así que cambiar de número allá se refleja aquí en ≤1 minuto, sin desplegar. Si
 *   LGS no responde, se usa el token propio (`WHAPI_TOKEN`) para no quedar mudos.
 * - **Si está vivo**: se le pregunta a Whapi (`/health`); código 4 = sesión autenticada.
 *   KIDS solo MUESTRA el estado (luz verde o aviso de línea caída): cambiar de número
 *   es cosa de Servicio LGS.
 */

const TTL_CANAL_MS = 60_000;
/** Si LGS no respondió, se vuelve a preguntar pronto. */
const TTL_CANAL_PROPIO_MS = 15_000;
const TTL_ESTADO_MS = 30_000;
const CODIGO_AUTENTICADO = 4;

export interface CanalWhatsApp {
  token: string;
  /** "A" | "B" según Contingencia de LGS; null si se usó el token propio. */
  canal: string | null;
  numero: string | null;
  origen: "LGS" | "PROPIO";
}

export interface EstadoLinea {
  /** SIMULADA = sin proveedor configurado (desarrollo): nada sale de verdad. */
  estado: "ACTIVA" | "CAIDA" | "SIMULADA";
  causa: string | null;
  canal: string | null;
  numero: string | null;
  verificadoEn: string;
}

let canalEnCache: { valor: CanalWhatsApp; expira: number } | null = null;
let estadoEnCache: { valor: EstadoLinea; expira: number } | null = null;

/** El canal por el que sale AHORA lo de KIDS, o null si no hay Whapi configurado. */
export async function canalActual(): Promise<CanalWhatsApp | null> {
  const propio = env().WHAPI_TOKEN;
  if (propio === undefined) return null;
  const ahora = Date.now();
  if (canalEnCache !== null && canalEnCache.expira > ahora) return canalEnCache.valor;

  const e = env();
  let valor: CanalWhatsApp = { token: propio, canal: null, numero: null, origen: "PROPIO" };
  let ttl = TTL_CANAL_PROPIO_MS;
  if (e.LGS_API_URL !== undefined && e.LGS_INTAKE_API_KEY !== undefined) {
    try {
      const res = await fetch(`${e.LGS_API_URL.replace(/\/+$/, "")}/api/kids-sync/whatsapp`, {
        headers: { "x-api-key": e.LGS_INTAKE_API_KEY },
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: unknown;
        canal?: unknown;
        numero?: unknown;
      };
      if (res.ok && typeof data.token === "string" && data.token.length > 10) {
        valor = {
          token: data.token,
          canal: typeof data.canal === "string" ? data.canal : null,
          numero: typeof data.numero === "string" ? data.numero : null,
          origen: "LGS",
        };
        ttl = TTL_CANAL_MS;
      } else {
        logger.warn("LGS no entregó el canal de WhatsApp; se usa el token propio", {
          status: res.status,
        });
      }
    } catch (error) {
      logger.warn("LGS no respondió el canal de WhatsApp; se usa el token propio", {
        error: String(error),
      });
    }
  }
  canalEnCache = { valor, expira: ahora + ttl };
  return valor;
}

/** Texto de la causa según lo que dijo Whapi. */
function causaDeEstado(texto: string): string {
  if (texto.toUpperCase() === "QR") {
    return "la sesión de WhatsApp de ese número está desconectada (pide escanear el QR de nuevo)";
  }
  return `estado de la línea: ${texto}`;
}

/** ¿La línea de mensajes está viva? Se recuerda 30 s para no consultar en cada pantalla. */
export async function estadoLinea(): Promise<EstadoLinea> {
  const ahora = Date.now();
  if (estadoEnCache !== null && estadoEnCache.expira > ahora) return estadoEnCache.valor;

  const canal = await canalActual();
  const base = { canal: canal?.canal ?? null, numero: canal?.numero ?? null };
  let valor: EstadoLinea;
  if (canal === null) {
    // Meta WhatsApp Cloud no tiene un /health equivalente aquí: se da por activa si está configurada.
    const meta = env().WHATSAPP_TOKEN !== undefined && env().WHATSAPP_PHONE_ID !== undefined;
    valor = {
      estado: meta ? "ACTIVA" : "SIMULADA",
      causa: null,
      ...base,
      verificadoEn: new Date().toISOString(),
    };
  } else {
    try {
      const res = await fetch("https://gate.whapi.cloud/health?wakeup=false", {
        headers: { authorization: `Bearer ${canal.token}` },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        status?: { code?: number; text?: string };
      };
      if (j.status?.code === CODIGO_AUTENTICADO) {
        valor = { estado: "ACTIVA", causa: null, ...base, verificadoEn: new Date().toISOString() };
      } else {
        const texto = j.status?.text ?? (res.ok ? "desconocido" : `HTTP ${String(res.status)}`);
        valor = {
          estado: "CAIDA",
          causa: causaDeEstado(texto),
          ...base,
          verificadoEn: new Date().toISOString(),
        };
      }
    } catch {
      valor = {
        estado: "CAIDA",
        causa: "no se pudo consultar el estado de la línea de WhatsApp",
        ...base,
        verificadoEn: new Date().toISOString(),
      };
    }
  }
  estadoEnCache = { valor, expira: ahora + TTL_ESTADO_MS };
  return valor;
}

/** Tras una falla de envío: que la próxima consulta mire de nuevo en vez de creer lo recordado. */
export function olvidarEstadoLinea(): void {
  estadoEnCache = null;
  canalEnCache = null;
}

/** Lo que se le dice a quien intentó enviar con la línea caída. */
export function mensajeLineaCaida(e: EstadoLinea): string {
  return (
    "La línea de mensajes de WhatsApp está caída: contacte a Servicio LGS para que la reactiven " +
    "o cambien el número." +
    (e.causa !== null ? ` Causa: ${e.causa}.` : "")
  );
}
