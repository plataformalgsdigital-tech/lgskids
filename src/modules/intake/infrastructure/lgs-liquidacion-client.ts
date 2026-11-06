import { env } from "@/platform/config/env";
import { ConflictError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";

/**
 * Llamadas a LGS para la liquidación de los guías (horas y facturas). LGS calcula
 * las horas y paga; KIDS guarda la factura que sube el guía. Misma clave de servicio
 * que el resto de la integración (`LGS_API_URL` + `LGS_INTAKE_API_KEY`).
 */

export interface CorteGuiaLgs {
  corte: "MES" | "Q1" | "Q2";
  estado: string;
  requiereFactura: boolean;
  horas: number;
  plazo: string;
  plazoReenvio: string | null;
  horasOk: boolean;
  pagadoEn: string | null;
  referenciaPago: string | null;
  maxFacturas?: number;
  factura: {
    nombre: string | null;
    estado: string;
    subidoEn: string;
    comentarioDevolucion: string | null;
    devueltaEn: string | null;
  } | null;
}

export interface LiquidacionGuiaLgs {
  registrada: boolean;
  pais?: string | null;
  tipoContratacion?: string | null;
  cortes: CorteGuiaLgs[];
}

function base(): { url: string; clave: string } {
  const e = env();
  if (!e.LGS_API_URL || !e.LGS_INTAKE_API_KEY) {
    throw new ConflictError("La conexión con LGS no está configurada.");
  }
  return { url: e.LGS_API_URL.replace(/\/+$/, ""), clave: e.LGS_INTAKE_API_KEY };
}

/** Cortes del mes del guía en LGS (horas, estado, plazo, su factura). Sin valores ($). */
export async function liquidacionGuiaEnLgs(
  guiaUserId: string,
  periodo: string,
): Promise<LiquidacionGuiaLgs> {
  const { url, clave } = base();
  const qs = new URLSearchParams({ kidsUserId: guiaUserId, periodo });
  let res: Response;
  try {
    res = await fetch(`${url}/api/kids-sync/liquidacion-guia?${qs.toString()}`, {
      headers: { "x-api-key": clave },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (error) {
    logger.error("LGS no respondió (liquidación del guía)", { error: String(error) });
    throw new ConflictError(
      "No se pudo consultar tus horas en LGS. Intenta de nuevo en unos minutos.",
    );
  }
  const data = (await res.json().catch(() => ({}))) as LiquidacionGuiaLgs & { error?: string };
  if (!res.ok) throw new ConflictError(`LGS: ${data.error ?? `HTTP ${String(res.status)}`}`);
  return data;
}

/**
 * Avisa a LGS que hay una factura nueva para que la tome ya (LGS la lee con IA, así que
 * puede tardar). Si falla, no pasa nada: LGS recoge las pendientes cada 15 minutos.
 */
export async function avisarFacturaALgs(facturaId: string): Promise<void> {
  let destino: { url: string; clave: string };
  try {
    destino = base();
  } catch {
    return;
  }
  try {
    await fetch(`${destino.url}/api/kids-sync/factura-guia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": destino.clave },
      body: JSON.stringify({ facturaId }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
  } catch (error) {
    logger.warn("Aviso de factura a LGS falló; la recogerá su cron", {
      facturaId,
      error: String(error),
    });
  }
}

/**
 * Pide a LGS retirar una factura que ya tomó. A diferencia del aviso, esta SÍ debe
 * confirmarse: si LGS no la retira, KIDS tampoco la quita (seguiría contando en LGS).
 */
export async function quitarFacturaEnLgs(facturaId: string): Promise<void> {
  const { url, clave } = base();
  let res: Response;
  try {
    res = await fetch(`${url}/api/kids-sync/factura-guia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": clave },
      body: JSON.stringify({ facturaId, accion: "quitar" }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (error) {
    logger.error("LGS no respondió (quitar factura)", { facturaId, error: String(error) });
    throw new ConflictError(
      "No se pudo quitar la factura en LGS. Intenta de nuevo en unos minutos.",
    );
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ConflictError(`LGS: ${data.error ?? `HTTP ${String(res.status)}`}`);
}
