import { env } from "@/platform/config/env";

/**
 * Texto → voz con ElevenLabs (2026-10-28). Solo lo usa la generación de las
 * voces del libro, desde el SERVIDOR: la clave nunca sale de aquí.
 *
 * MP3 de 44,1 kHz a 64 kb/s: una frase pesa decenas de KB y la voz se oye
 * limpia en una tableta (más calidad pide plan Creator y no se nota en voz).
 */

const URL_API = "https://api.elevenlabs.io/v1/text-to-speech";
const FORMATO = "mp3_44100_64";
/** Una frase tarda 1–3 s; 60 es margen para una lectura larga en hora punta. */
const TIEMPO_MAXIMO_MS = 60_000;

export interface Sintetizador {
  /** El modelo con que se generan (queda guardado con cada audio). */
  readonly modelo: string;
  sintetizar(texto: string, voiceId: string): Promise<Buffer>;
}

/**
 * Error de ElevenLabs. `detener` = no tiene sentido seguir con las demás frases
 * (clave inválida, sin créditos, voz que el plan no permite): cada intento
 * fallaría igual y solo llenaría la lista de errores.
 */
export class ErrorElevenLabs extends Error {
  constructor(
    message: string,
    readonly detener: boolean,
  ) {
    super(message);
    this.name = "ErrorElevenLabs";
  }
}

class ElevenLabs implements Sintetizador {
  constructor(
    private readonly clave: string,
    readonly modelo: string,
  ) {}

  async sintetizar(texto: string, voiceId: string): Promise<Buffer> {
    let r: Response;
    try {
      r = await fetch(`${URL_API}/${encodeURIComponent(voiceId)}?output_format=${FORMATO}`, {
        method: "POST",
        headers: {
          "xi-api-key": this.clave,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({ text: texto, model_id: this.modelo }),
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      });
    } catch (e) {
      throw new ErrorElevenLabs(
        `No se pudo conectar con ElevenLabs: ${e instanceof Error ? e.message : String(e)}`,
        false,
      );
    }
    if (r.ok) return Buffer.from(await r.arrayBuffer());

    const cuerpo = await r.text().catch(() => "");
    let detalle = cuerpo.slice(0, 300);
    try {
      const j = JSON.parse(cuerpo) as { detail?: { status?: string; message?: string } | string };
      detalle =
        typeof j.detail === "string"
          ? j.detail
          : [j.detail?.status, j.detail?.message].filter(Boolean).join(": ");
    } catch {
      // no era JSON: queda el texto tal cual
    }
    // 401 clave mala o sin permiso; 402/quota_exceeded sin créditos; 400 con
    // voz no permitida por el plan. Esas no se arreglan reintentando.
    const detener =
      r.status === 401 ||
      r.status === 402 ||
      /quota_exceeded|payment_required|voice_not_found|subscription|plan/i.test(detalle);
    throw new ErrorElevenLabs(`ElevenLabs respondió ${String(r.status)}: ${detalle}`, detener);
  }
}

let paraPruebas: Sintetizador | null = null;

/** Solo pruebas: un sintetizador falso, sin red ni créditos. */
export function setSintetizadorParaPruebas(s: Sintetizador | null): void {
  paraPruebas = s;
}

/** El sintetizador configurado, o null si falta `ELEVENLABS_API_KEY`. */
export function getSintetizador(): Sintetizador | null {
  if (paraPruebas !== null) return paraPruebas;
  const { ELEVENLABS_API_KEY: clave, ELEVENLABS_MODELO: modelo } = env();
  return clave === undefined ? null : new ElevenLabs(clave, modelo);
}
