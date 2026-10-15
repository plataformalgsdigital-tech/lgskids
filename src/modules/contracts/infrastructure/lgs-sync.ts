import { env } from "@/platform/config/env";
import { ConflictError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";

/**
 * Camino de VUELTA hacia LGS: cuando un OnHold se abre o se cierra en KIDS
 * sobre un contrato que viene de LGS, LGS tiene que quedar igual (estado,
 * fechas, historial y fecha final del beneficiario). Va a
 * `POST {LGS_API_URL}/api/kids-sync/onhold` con la misma clave de servicio
 * que usa LGS para entrar aquí (`LGS_INTAKE_API_KEY`).
 *
 * Sin URL o sin clave, la sincronización está apagada y se devuelve
 * `{ configurado: false }`: el OnHold sigue siendo válido en KIDS.
 */

export type AccionOnholdLgs =
  | {
      accion: "activar";
      externalRef: string;
      desde: string;
      hasta: string;
      motivo: string;
      activadoPor: string | null;
    }
  | { accion: "reactivar"; externalRef: string; dias: number };

/** Extensión manual de vigencia hecha en KIDS → la misma en LGS (`/api/kids-sync/extension`). */
export interface ExtensionLgs {
  externalRef: string;
  dias: number;
  motivo: string;
  ejecutadoPor: string | null;
}

export interface RespuestaLgs {
  configurado: boolean;
  /** false = LGS no tenía nada que hacer (ya estaba así o no existe allá). */
  aplicado?: boolean;
  mensaje?: string;
}

export function lgsSyncConfigurado(): boolean {
  const e = env();
  return Boolean(e.LGS_API_URL && e.LGS_INTAKE_API_KEY);
}

/**
 * Llama a LGS. Si LGS RECHAZA (regla de negocio: tope de 2 OnHold, extensión
 * manual previa…) o no responde, lanza ConflictError con el motivo: quien
 * llama decide si eso frena la operación (manual) o solo se registra (worker).
 */
export async function avisarOnholdALgs(cuerpo: AccionOnholdLgs): Promise<RespuestaLgs> {
  return llamarLgs("onhold", cuerpo);
}

/** Extensión hecha en KIDS → LGS (mismas reglas de error que el OnHold). */
export async function avisarExtensionALgs(cuerpo: ExtensionLgs): Promise<RespuestaLgs> {
  return llamarLgs("extension", cuerpo);
}

async function llamarLgs(ruta: "onhold" | "extension", cuerpo: object): Promise<RespuestaLgs> {
  const e = env();
  if (!e.LGS_API_URL || !e.LGS_INTAKE_API_KEY) return { configurado: false };
  const url = `${e.LGS_API_URL.replace(/\/+$/, "")}/api/kids-sync/${ruta}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": e.LGS_INTAKE_API_KEY },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    logger.error("LGS no respondió al sincronizar", { ruta, error: String(error) });
    throw new ConflictError(
      "No se pudo confirmar el cambio con LGS (no respondió). Intenta de nuevo en unos minutos.",
    );
  }
  const texto = await res.text();
  let data: { success?: boolean; error?: string; aplicado?: boolean; mensaje?: string } = {};
  try {
    data = texto ? JSON.parse(texto) : {};
  } catch {
    // respuesta no-JSON
  }
  if (res.status === 404) {
    // LGS no tiene a ese beneficiario: el contrato vive solo en KIDS.
    return { configurado: true, aplicado: false, mensaje: data.error ?? "No existe en LGS." };
  }
  if (!res.ok || data.success === false) {
    throw new ConflictError(`LGS rechazó el cambio: ${data.error ?? `HTTP ${String(res.status)}`}`);
  }
  return {
    configurado: true,
    aplicado: data.aplicado !== false,
    ...(data.mensaje !== undefined && { mensaje: data.mensaje }),
  };
}
