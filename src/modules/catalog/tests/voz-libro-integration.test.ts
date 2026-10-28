import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryRows } from "@/platform/db/query";
import {
  eliminarMaterial,
  setPrefijoMaterialParaPruebas,
  subirMaterial,
} from "../application/material";
import {
  archivoVozGenerada,
  estadoVocesLibro,
  generarVocesLibro,
  guardarIntervencion,
  prepararVocesLibro,
  vocesParaLibro,
} from "../application/voz-libro";
import { VOZ_PERSONAJE, claveVoz } from "../domain/voz-libro";
import { ErrorElevenLabs, setSintetizadorParaPruebas } from "../infrastructure/elevenlabs";

/**
 * INTEGRACIÓN: VOCES DEL LIBRO (2026-10-28). Preparar lee el libro cargado y las
 * intervenciones; generar llama a ElevenLabs (aquí, uno FALSO) con la voz de
 * quien dice cada frase; lo generado no se vuelve a pagar; sin créditos se
 * detiene; y el libro recibe qué frases tienen audio.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
// Un nivel que el material real no usa, y un prefijo propio para el libro.
const CURSO = "YOUNGSTER";
const NIVEL = "ULTIMATE";

const LIBRO = `<!doctype html><html><head></head><body><script>
const D={units:[{intro:"Hello! I am Rooky."}],
  pages:[{u:0,who:"dodo",lead:"I can sing!",say:"I can sing. La la la.",cards:[["🎵","Sing","Cantar"]]}]};
</script></body></html>`;

describe.runIf(RUN)("voces del libro (integración)", () => {
  const llamadas: { texto: string; voiceId: string }[] = [];
  let sinCreditosDesde = Infinity;

  beforeAll(async () => {
    setPrefijoMaterialParaPruebas(`prueba_voces_${String(Date.now())}`);
    await subirMaterial({
      actorUserId: ACTOR,
      tipo: "interactivo",
      curso: CURSO,
      nivel: NIVEL,
      nombreOriginal: "libro.html",
      bytes: Buffer.from(LIBRO, "utf8"),
    });
    await guardarIntervencion({
      actorUserId: ACTOR,
      curso: CURSO,
      nivel: NIVEL,
      pagina: 1,
      personaje: "SIMBA",
      texto: "Woof! Great job, explorer!",
    });
    setSintetizadorParaPruebas({
      modelo: "falso",
      sintetizar: (texto, voiceId) => {
        if (llamadas.length >= sinCreditosDesde) {
          return Promise.reject(new ErrorElevenLabs("quota_exceeded", true));
        }
        llamadas.push({ texto, voiceId });
        return Promise.resolve(Buffer.from(`ID3 audio de ${texto}`));
      },
    });
  });

  afterAll(async () => {
    setSintetizadorParaPruebas(null);
    const archivos = await queryRows<{ fileId: string }>(
      `SELECT file_id AS "fileId" FROM catalog_libro_voz
        WHERE curso = $1 AND nivel = $2 AND file_id IS NOT NULL`,
      [CURSO, NIVEL],
    );
    await execute(`DELETE FROM catalog_libro_voz WHERE curso = $1 AND nivel = $2`, [CURSO, NIVEL]);
    await execute(`DELETE FROM files_object WHERE id = ANY($1)`, [archivos.map((a) => a.fileId)]);
    await execute(`DELETE FROM catalog_libro_intervencion WHERE curso = $1 AND nivel = $2`, [
      CURSO,
      NIVEL,
    ]);
    await eliminarMaterial({ actorUserId: ACTOR, tipo: "interactivo", curso: CURSO, nivel: NIVEL });
    await closePool();
  });

  it("prepara, genera con la voz de cada uno y no vuelve a pagar lo hecho", async () => {
    // Si una corrida anterior quedó a medias, empieza limpio.
    await execute(`DELETE FROM catalog_libro_voz WHERE curso = $1 AND nivel = $2`, [CURSO, NIVEL]);
    const p = await prepararVocesLibro({ actorUserId: ACTOR, curso: CURSO, nivel: NIVEL });
    // intervención + lead + historia (entera y 2 frases) + say + tarjeta
    expect(p.total).toBe(7);
    expect(p.nuevas).toBe(7);

    const r = await generarVocesLibro({ actorUserId: ACTOR, curso: CURSO, nivel: NIVEL });
    expect(r).toEqual({ generados: 7, errores: 0, detenido: null });
    const voz = (t: string) => llamadas.find((l) => l.texto === t)?.voiceId;
    expect(voz("I can sing!")).toBe(VOZ_PERSONAJE.DODO.voiceId);
    expect(voz("Woof! Great job, explorer!")).toBe(VOZ_PERSONAJE.SIMBA.voiceId);
    expect(voz("I can sing. La la la.")).toBe(VOZ_PERSONAJE.GUIA.voiceId);

    // Lo que recibe el libro: las claves con audio y la intervención.
    const v = await vocesParaLibro(CURSO, NIVEL);
    expect(v.disponibles).toContain(claveVoz("I can sing!"));
    expect(v.intervenciones).toEqual([
      { pagina: 1, texto: "Woof! Great job, explorer!", nombre: "Simba", imagen: "simba" },
    ]);
    expect(await archivoVozGenerada(CURSO, NIVEL, claveVoz("Sing"))).not.toBeNull();

    // Volver a preparar y generar no llama de nuevo a ElevenLabs.
    await prepararVocesLibro({ actorUserId: ACTOR, curso: CURSO, nivel: NIVEL });
    const otra = await generarVocesLibro({ actorUserId: ACTOR, curso: CURSO, nivel: NIVEL });
    expect(otra.generados).toBe(0);
    expect(llamadas).toHaveLength(7);
  });

  it("sin créditos se detiene en la primera, en vez de fallar frase por frase", async () => {
    await guardarIntervencion({
      actorUserId: ACTOR,
      curso: CURSO,
      nivel: NIVEL,
      pagina: 2,
      personaje: "ROOKY",
      texto: "You can do it!",
    });
    await guardarIntervencion({
      actorUserId: ACTOR,
      curso: CURSO,
      nivel: NIVEL,
      pagina: 3,
      personaje: "DODO",
      texto: "Let's sing together!",
    });
    await prepararVocesLibro({ actorUserId: ACTOR, curso: CURSO, nivel: NIVEL });
    sinCreditosDesde = llamadas.length; // desde ya, ElevenLabs dice que no hay créditos
    const r = await generarVocesLibro({ actorUserId: ACTOR, curso: CURSO, nivel: NIVEL });
    expect(r.generados).toBe(0);
    expect(r.errores).toBe(1);
    expect(r.detenido).toContain("quota_exceeded");
    const e = await estadoVocesLibro(CURSO, NIVEL);
    expect(e.resumen.errores).toBe(1);
    expect(e.resumen.pendientes).toBe(1);
  });
});
