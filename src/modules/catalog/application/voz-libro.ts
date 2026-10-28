import { registrarAuditoria } from "@/modules/audit";
import {
  descargarArchivo,
  eliminarArchivo,
  subirArchivo,
  type PoliticaArchivo,
} from "@/modules/files";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { logger } from "@/platform/logging/logger";
import {
  PERSONAJES_VOZ,
  VOZ_PERSONAJE,
  claveVoz,
  esPersonajeVoz,
  frasesDelLibro,
  normalizarFrase,
  type PersonajeVoz,
} from "../domain/voz-libro";
import { ErrorElevenLabs, getSintetizador } from "../infrastructure/elevenlabs";
import { claveMaterial, materialVigente } from "./material";

/**
 * VOCES DEL LIBRO (2026-10-28): los audios de ElevenLabs de cada libro
 * interactivo (curso·nivel). Ver las reglas en `domain/voz-libro.ts`.
 *
 * Ciclo: PREPARAR lee del libro cargado las frases que dice (y las
 * intervenciones de los personajes) y crea una fila PENDIENTE por cada frase
 * nueva; GENERAR las manda a ElevenLabs de a una y guarda cada MP3 en `files`.
 * Lo ya GENERADO no se vuelve a pagar: volver a preparar tras reemplazar el
 * libro solo agrega lo nuevo.
 */

const ENTIDAD_ARCHIVO = "catalog_libro_voz";

const POLITICA_AUDIO: PoliticaArchivo = {
  mimes: new Map([["audio/mpeg", "mp3"]]),
  tamanoMaximo: 5 * 1024 * 1024,
};

export interface VozLibro {
  id: string;
  clave: string;
  personaje: PersonajeVoz;
  texto: string;
  origen: "LIBRO" | "INTERVENCION";
  estado: "PENDIENTE" | "GENERADO" | "ERROR";
  error: string | null;
  generadoEn: Date | null;
}

export interface Intervencion {
  id: string;
  pagina: number;
  personaje: PersonajeVoz;
  texto: string;
  orden: number;
  activo: boolean;
}

/** Libros en generación en ESTE proceso: la pantalla lo muestra y no se duplica. */
const generando = new Set<string>();

export async function estadoVocesLibro(curso: string, nivel: string) {
  const clave = claveMaterial(curso, nivel);
  const [voces, intervenciones, libro] = await Promise.all([
    queryRows<VozLibro>(
      `SELECT id, clave, personaje, texto, origen, estado, error, generado_en AS "generadoEn"
         FROM catalog_libro_voz WHERE curso = $1 AND nivel = $2
        ORDER BY origen DESC, creado_en, texto`,
      [curso, nivel],
    ),
    listarIntervenciones(curso, nivel),
    materialVigente("interactivo", curso, nivel),
  ]);
  const cuenta = (e: VozLibro["estado"]) => voces.filter((v) => v.estado === e).length;
  return {
    libro: libro === null ? null : { id: libro.id, nombre: libro.nombre },
    configurado: getSintetizador() !== null,
    modelo: getSintetizador()?.modelo ?? null,
    generando: generando.has(clave),
    personajes: PERSONAJES_VOZ.map((p) => ({ personaje: p, ...VOZ_PERSONAJE[p] })),
    resumen: {
      total: voces.length,
      generados: cuenta("GENERADO"),
      pendientes: cuenta("PENDIENTE"),
      errores: cuenta("ERROR"),
      // Lo que costaría generar lo que falta (1 crédito por carácter en v2/v3).
      caracteresPorGenerar: voces
        .filter((v) => v.estado !== "GENERADO")
        .reduce((a, v) => a + v.texto.length, 0),
    },
    voces,
    intervenciones,
  };
}

/**
 * Lee el libro vigente y deja PENDIENTE cada frase que todavía no tenga audio.
 * Si una frase ya generada cambia de personaje (se editó quién la dice), vuelve
 * a PENDIENTE: su audio es de otra voz.
 */
export async function prepararVocesLibro(input: {
  actorUserId: string;
  curso: string;
  nivel: string;
}): Promise<{ nuevas: number; total: number }> {
  claveMaterial(input.curso, input.nivel);
  const libro = await materialVigente("interactivo", input.curso, input.nivel);
  if (libro === null) {
    throw new ConflictError("Este nivel todavía no tiene libro interactivo cargado.");
  }
  const { bytes } = await descargarArchivo(libro.id);
  const frases: { texto: string; personaje: PersonajeVoz; origen: VozLibro["origen"] }[] = [
    ...(await listarIntervenciones(input.curso, input.nivel))
      .filter((i) => i.activo)
      .map((i) => ({
        texto: normalizarFrase(i.texto),
        personaje: i.personaje,
        origen: "INTERVENCION" as const,
      })),
    ...frasesDelLibro(bytes.toString("utf8")).map((f) => ({ ...f, origen: "LIBRO" as const })),
  ];
  let nuevas = 0;
  const vistas = new Set<string>();
  for (const f of frases) {
    const clave = claveVoz(f.texto);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const r = await queryOne<{ nueva: boolean }>(
      `INSERT INTO catalog_libro_voz (id, curso, nivel, clave, personaje, texto, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (curso, nivel, clave) DO UPDATE
         SET personaje = EXCLUDED.personaje, origen = EXCLUDED.origen,
             estado = CASE WHEN catalog_libro_voz.personaje <> EXCLUDED.personaje
                           THEN 'PENDIENTE' ELSE catalog_libro_voz.estado END,
             actualizado_en = now()
       RETURNING (xmax = 0) AS nueva`,
      [newId(), input.curso, input.nivel, clave, f.personaje, f.texto, f.origen],
    );
    if (r?.nueva === true) nuevas++;
  }
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.voces_libro.preparadas",
    entidad: "catalog_libro_voz",
    entidadId: null,
    payload: { curso: input.curso, nivel: input.nivel, frases: vistas.size, nuevas },
  });
  return { nuevas, total: vistas.size };
}

/**
 * Genera, de a UNA, las frases PENDIENTES o con ERROR del libro. Corre después
 * de responder (`after()`); la pantalla consulta el avance. Si ElevenLabs dice
 * que no hay cómo (sin créditos, clave mala, voz no permitida) se detiene: las
 * demás fallarían igual.
 */
export async function generarVocesLibro(input: {
  actorUserId: string;
  curso: string;
  nivel: string;
}): Promise<{ generados: number; errores: number; detenido: string | null }> {
  const libro = claveMaterial(input.curso, input.nivel);
  const sintetizador = getSintetizador();
  if (sintetizador === null) {
    throw new ConflictError("Falta configurar ElevenLabs (ELEVENLABS_API_KEY).");
  }
  if (generando.has(libro)) return { generados: 0, errores: 0, detenido: null };
  generando.add(libro);
  let generados = 0;
  let errores = 0;
  let detenido: string | null = null;
  try {
    const pendientes = await queryRows<{
      id: string;
      clave: string;
      personaje: PersonajeVoz;
      texto: string;
      fileId: string | null;
    }>(
      `SELECT id, clave, personaje, texto, file_id AS "fileId" FROM catalog_libro_voz
        WHERE curso = $1 AND nivel = $2 AND estado <> 'GENERADO'
        ORDER BY origen DESC, creado_en`,
      [input.curso, input.nivel],
    );
    for (const v of pendientes) {
      const voz = VOZ_PERSONAJE[v.personaje];
      try {
        const mp3 = await sintetizador.sintetizar(v.texto, voz.voiceId);
        const { id: fileId } = await subirArchivo({
          actorUserId: input.actorUserId,
          nombreOriginal: `${v.clave}.mp3`,
          mime: "audio/mpeg",
          bytes: mp3,
          entidad: ENTIDAD_ARCHIVO,
          entidadId: `${libro}:${v.clave}`,
          politica: POLITICA_AUDIO,
        });
        await execute(
          `UPDATE catalog_libro_voz
              SET estado = 'GENERADO', file_id = $2, voice_id = $3, modelo = $4, error = NULL,
                  generado_en = now(), actualizado_en = now()
            WHERE id = $1`,
          [v.id, fileId, voz.voiceId, sintetizador.modelo],
        );
        // El audio anterior (regenerado) ya no lo pide nadie.
        if (v.fileId !== null) await eliminarArchivo(v.fileId);
        generados++;
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : String(e);
        errores++;
        await execute(
          `UPDATE catalog_libro_voz SET estado = 'ERROR', error = $2, actualizado_en = now()
            WHERE id = $1`,
          [v.id, mensaje.slice(0, 500)],
        );
        if (e instanceof ErrorElevenLabs && e.detener) {
          detenido = mensaje;
          break;
        }
      }
    }
  } finally {
    generando.delete(libro);
  }
  logger.info("Voces del libro generadas", { libro, generados, errores, detenido });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.voces_libro.generadas",
    entidad: "catalog_libro_voz",
    entidadId: null,
    payload: { curso: input.curso, nivel: input.nivel, generados, errores, detenido },
  });
  return { generados, errores, detenido };
}

/** Vuelve a PENDIENTE un audio (para regenerarlo, p. ej. si sonó raro). */
export async function regenerarVoz(input: { actorUserId: string; id: string }): Promise<void> {
  const n = await execute(
    `UPDATE catalog_libro_voz SET estado = 'PENDIENTE', error = NULL, actualizado_en = now()
      WHERE id = $1`,
    [input.id],
  );
  if (n === 0) throw new NotFoundError("Ese audio no existe.");
}

/** El MP3 de un audio por su id (la escucha del equipo), o null si no tiene. */
export async function archivoDeVoz(id: string): Promise<string | null> {
  const f = await queryOne<{ fileId: string | null }>(
    `SELECT file_id AS "fileId" FROM catalog_libro_voz WHERE id = $1`,
    [id],
  );
  return f?.fileId ?? null;
}

/** El MP3 GENERADO de una frase del libro, o null. Es lo que pide el libro. */
export async function archivoVozGenerada(
  curso: string,
  nivel: string,
  clave: string,
): Promise<string | null> {
  const f = await queryOne<{ fileId: string | null }>(
    `SELECT file_id AS "fileId" FROM catalog_libro_voz
      WHERE curso = $1 AND nivel = $2 AND clave = $3 AND estado = 'GENERADO'`,
    [curso, nivel, clave],
  );
  return f?.fileId ?? null;
}

/**
 * Lo que el libro necesita para hablar, y que el panel le entrega por
 * `window.name`: qué frases tienen audio y las intervenciones activas, con el
 * nombre y el dibujo (la clave de `D.assets`) de cada personaje.
 */
export async function vocesParaLibro(curso: string, nivel: string) {
  const [disponibles, intervenciones] = await Promise.all([
    queryRows<{ clave: string }>(
      `SELECT clave FROM catalog_libro_voz
        WHERE curso = $1 AND nivel = $2 AND estado = 'GENERADO'`,
      [curso, nivel],
    ),
    listarIntervenciones(curso, nivel),
  ]);
  return {
    disponibles: disponibles.map((d) => d.clave),
    intervenciones: intervenciones
      .filter((i) => i.activo)
      .map((i) => ({
        pagina: i.pagina,
        texto: i.texto,
        nombre: VOZ_PERSONAJE[i.personaje].etiqueta.replace(/ \(.*\)$/, ""),
        imagen: VOZ_PERSONAJE[i.personaje].imagen,
      })),
  };
}

// —— Intervenciones de los personajes ————————————————————————————————

export async function listarIntervenciones(curso: string, nivel: string): Promise<Intervencion[]> {
  return queryRows<Intervencion>(
    `SELECT id, pagina, personaje, texto, orden, activo FROM catalog_libro_intervencion
      WHERE curso = $1 AND nivel = $2 ORDER BY pagina, orden, creado_en`,
    [curso, nivel],
  );
}

function validarIntervencion(d: { pagina: number; personaje: string; texto: string }): void {
  if (!Number.isInteger(d.pagina) || d.pagina < 1 || d.pagina > 999) {
    throw new ValidationError("La página va de 1 a 999 (la que se ve en el libro).");
  }
  if (!esPersonajeVoz(d.personaje)) throw new ValidationError("Personaje inválido.");
  const t = d.texto.trim();
  if (t === "" || t.length > 300) throw new ValidationError("La frase va de 1 a 300 caracteres.");
}

export async function guardarIntervencion(input: {
  actorUserId: string;
  id?: string | undefined;
  curso: string;
  nivel: string;
  pagina: number;
  personaje: string;
  texto: string;
  orden?: number | undefined;
  activo?: boolean | undefined;
}): Promise<{ id: string }> {
  claveMaterial(input.curso, input.nivel);
  validarIntervencion(input);
  const id = input.id ?? newId();
  const valores = [
    id,
    input.curso,
    input.nivel,
    input.pagina,
    input.personaje,
    input.texto.trim(),
    input.orden ?? 1,
    input.activo ?? true,
  ];
  if (input.id === undefined) {
    await execute(
      `INSERT INTO catalog_libro_intervencion
         (id, curso, nivel, pagina, personaje, texto, orden, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      valores,
    );
  } else {
    const n = await execute(
      `UPDATE catalog_libro_intervencion
          SET pagina = $4, personaje = $5, texto = $6, orden = $7, activo = $8, actualizado_en = now()
        WHERE id = $1 AND curso = $2 AND nivel = $3`,
      valores,
    );
    if (n === 0) throw new NotFoundError("Esa intervención no existe.");
  }
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: input.id === undefined ? "catalog.intervencion.creada" : "catalog.intervencion.editada",
    entidad: "catalog_libro_intervencion",
    entidadId: id,
    payload: {
      curso: input.curso,
      nivel: input.nivel,
      pagina: input.pagina,
      personaje: input.personaje,
    },
  });
  return { id };
}

export async function eliminarIntervencion(input: {
  actorUserId: string;
  id: string;
}): Promise<void> {
  const n = await execute(`DELETE FROM catalog_libro_intervencion WHERE id = $1`, [input.id]);
  if (n === 0) throw new NotFoundError("Esa intervención no existe.");
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.intervencion.eliminada",
    entidad: "catalog_libro_intervencion",
    entidadId: input.id,
    payload: {},
  });
}
