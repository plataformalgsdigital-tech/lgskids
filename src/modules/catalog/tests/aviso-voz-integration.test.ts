import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eliminarArchivo, listarArchivos } from "@/modules/files";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { audioNivelBloqueado, TEXTO_NIVEL_BLOQUEADO } from "../application/aviso-voz";
import { VOZ_PERSONAJE } from "../domain/voz-libro";
import { setSintetizadorParaPruebas } from "../infrastructure/elevenlabs";

/**
 * INTEGRACIÓN: voz del aviso "Aún no puedes acceder a este mapa". Se genera UNA vez
 * con la voz del personaje, se guarda y no se vuelve a pagar; sin ElevenLabs
 * devuelve null (el panel usa la voz del dispositivo).
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";

async function limpiar() {
  for (const a of await listarArchivos({ entidad: "aviso_voz", limit: 50 })) {
    await eliminarArchivo(a.id);
  }
}

describe.runIf(RUN)("voz del aviso de nivel bloqueado (integración)", () => {
  const llamadas: { texto: string; voiceId: string }[] = [];

  beforeEach(async () => {
    llamadas.length = 0;
    await limpiar();
    setSintetizadorParaPruebas({
      modelo: "falso",
      sintetizar: (texto, voiceId) => {
        llamadas.push({ texto, voiceId });
        return Promise.resolve(Buffer.from("ID3 audio"));
      },
    });
  });

  afterAll(async () => {
    setSintetizadorParaPruebas(null);
    await limpiar();
    await closePool();
  });

  it("genera con la voz de cada personaje y la segunda vez sirve lo guardado", async () => {
    const simba = await audioNivelBloqueado("simba", ACTOR);
    expect(simba?.toString()).toBe("ID3 audio");
    expect(llamadas).toEqual([
      { texto: TEXTO_NIVEL_BLOQUEADO, voiceId: VOZ_PERSONAJE.SIMBA.voiceId },
    ]);

    await audioNivelBloqueado("simba", ACTOR);
    expect(llamadas).toHaveLength(1); // no se vuelve a pagar

    await audioNivelBloqueado("emma", ACTOR);
    expect(llamadas.at(-1)?.voiceId).toBe(VOZ_PERSONAJE.GUIA.voiceId);
  });

  it("dos niños a la vez generan UN solo audio", async () => {
    await Promise.all([audioNivelBloqueado("simba", ACTOR), audioNivelBloqueado("simba", ACTOR)]);
    expect(llamadas).toHaveLength(1);
  });

  it("si ElevenLabs falla devuelve null y no guarda nada", async () => {
    setSintetizadorParaPruebas({
      modelo: "falso",
      sintetizar: () => Promise.reject(new Error("sin créditos")),
    });
    expect(await audioNivelBloqueado("emma", ACTOR)).toBeNull();
    expect(await listarArchivos({ entidad: "aviso_voz" })).toHaveLength(0);
  });
});
