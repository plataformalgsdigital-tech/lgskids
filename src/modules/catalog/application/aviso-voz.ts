import { descargarArchivo, listarArchivos, subirArchivo } from "@/modules/files";
import { logger } from "@/platform/logging/logger";
import { getSintetizador } from "../infrastructure/elevenlabs";
import { VOZ_PERSONAJE } from "../domain/voz-libro";

/**
 * Voz del aviso "Aún no puedes acceder a este mapa" (panel del alumno › Avance,
 * 2026-11-12). El personaje la dice con SU voz de ElevenLabs: se genera UNA vez, se
 * guarda en `files` y de ahí en adelante se sirve el archivo — no se vuelve a pagar
 * por cada niño que toca un nivel bloqueado.
 *
 * El texto es el MISMO que muestra `src/app/mi-panel/NivelBloqueado.tsx`. Si se
 * cambia, sube `VERSION` para que se genere de nuevo.
 */
export const TEXTO_NIVEL_BLOQUEADO =
  "Aún no puedes acceder a este mapa, pero ya pronto podrás. Solo esfuérzate un poco más.";
const VERSION = "v1";
const ENTIDAD = "aviso_voz";

/** Quién habla: Simba (Junior) o la guía Emma (Youngster). */
export type QuienAviso = "simba" | "emma";
const PERSONAJE = { simba: "SIMBA", emma: "GUIA" } as const;

/** Evita que dos niños que lo piden a la vez generen (y paguen) el mismo audio. */
const enCurso = new Map<string, Promise<Buffer | null>>();

/**
 * El MP3 del aviso con la voz del personaje, o null si no se puede generar (sin
 * clave de ElevenLabs, sin créditos, voz no permitida): el panel entonces usa la voz
 * del dispositivo. `actorUserId` queda como dueño del archivo (clave foránea).
 */
export async function audioNivelBloqueado(
  quien: QuienAviso,
  actorUserId: string,
): Promise<Buffer | null> {
  const entidadId = `NIVEL_BLOQUEADO:${PERSONAJE[quien]}:${VERSION}`;
  const [guardado] = await listarArchivos({ entidad: ENTIDAD, entidadId, limit: 1 });
  if (guardado !== undefined) return (await descargarArchivo(guardado.id)).bytes;

  const previo = enCurso.get(entidadId);
  if (previo !== undefined) return previo;

  const trabajo = (async () => {
    const sintetizador = getSintetizador();
    if (sintetizador === null) return null;
    try {
      const bytes = await sintetizador.sintetizar(
        TEXTO_NIVEL_BLOQUEADO,
        VOZ_PERSONAJE[PERSONAJE[quien]].voiceId,
      );
      await subirArchivo({
        actorUserId,
        nombreOriginal: `nivel-bloqueado-${quien}.mp3`,
        mime: "audio/mpeg",
        bytes,
        entidad: ENTIDAD,
        entidadId,
      });
      return bytes;
    } catch (error) {
      logger.warn("No se pudo generar la voz del aviso de nivel bloqueado", {
        quien,
        error: String(error),
      });
      return null;
    }
  })().finally(() => enCurso.delete(entidadId));
  enCurso.set(entidadId, trabajo);
  return trabajo;
}
