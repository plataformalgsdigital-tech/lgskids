import { after } from "next/server";
import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { descargarArchivo } from "@/modules/files";
import { NotFoundError } from "@/platform/errors";
import { handler, handlerWithAuth, json } from "@/platform/http/handler";
import { respuestaConRango } from "@/platform/http/rango";
import { logger } from "@/platform/logging/logger";
import { archivoDeMaterial } from "../application/material";
import { tokenVideosLibroValido } from "../application/video-libro";
import {
  archivoDeVoz,
  archivoVozGenerada,
  eliminarIntervencion,
  estadoVocesLibro,
  generarVocesLibro,
  guardarIntervencion,
  prepararVocesLibro,
  regenerarVoz,
} from "../application/voz-libro";
import { PERSONAJES_VOZ, leerNombreArchivoAudio } from "../domain/voz-libro";

type Contexto = { params: Promise<Record<string, string | string[]>> };

async function param(context: Contexto, nombre: string): Promise<string> {
  const v = (await context.params)[nombre];
  return typeof v === "string" ? v : "";
}

// —— Mantenimiento (equipo) ————————————————————————————————————————————

/** GET /api/catalog/material/voces?curso=&nivel= — audios e intervenciones del libro. */
export const vocesLibroEstadoHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const q = request.nextUrl.searchParams;
  return json(await estadoVocesLibro(q.get("curso") ?? "", q.get("nivel") ?? ""));
});

const accionSchema = z.discriminatedUnion("accion", [
  // Lee el libro, registra lo que falta y lo manda a generar.
  z.object({ accion: z.literal("generar"), curso: z.string(), nivel: z.string() }),
  // Solo registra lo que falta (para ver cuánto costaría antes de gastar).
  z.object({ accion: z.literal("preparar"), curso: z.string(), nivel: z.string() }),
  z.object({ accion: z.literal("regenerar"), id: z.uuid() }),
]);

/**
 * POST /api/catalog/material/voces — preparar, generar o regenerar. Generar
 * responde 202 en cuanto quedan registradas las frases; las llamadas a
 * ElevenLabs corren con `after()` y la pantalla consulta el avance.
 */
export const vocesLibroAccionHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  profile.requireOpcion("op.mant.voces_generar");
  const body = accionSchema.parse(await request.json());
  if (body.accion === "regenerar") {
    await regenerarVoz({ actorUserId: auth.userId, id: body.id });
    return json({ ok: true });
  }
  const r = await prepararVocesLibro({
    actorUserId: auth.userId,
    curso: body.curso,
    nivel: body.nivel,
  });
  if (body.accion === "generar") {
    const datos = { actorUserId: auth.userId, curso: body.curso, nivel: body.nivel };
    after(() =>
      generarVocesLibro(datos).catch((e: unknown) =>
        logger.warn("No se pudieron generar las voces del libro", { error: String(e) }),
      ),
    );
    return json(r, { status: 202 });
  }
  return json(r);
});

/** GET /api/catalog/material/voces/[id]/escuchar — el audio, para revisarlo. */
export const vozLibroEscucharHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const fileId = await archivoDeVoz(z.uuid().parse(await param(context, "id")));
  if (fileId === null) throw new NotFoundError("Ese audio todavía no se generó.");
  const { bytes } = await descargarArchivo(fileId);
  return respuestaConRango(bytes, request.headers.get("range"), {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "private, max-age=60",
  });
});

const intervencionSchema = z.object({
  curso: z.string(),
  nivel: z.string(),
  pagina: z.number().int(),
  personaje: z.enum(PERSONAJES_VOZ),
  texto: z.string().max(300),
  orden: z.number().int().min(1).max(9).optional(),
  activo: z.boolean().optional(),
});

/** POST /api/catalog/material/intervenciones — una frase nueva de un personaje. */
export const intervencionCrearHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  profile.requireOpcion("op.mant.voces_generar");
  const body = intervencionSchema.parse(await request.json());
  return json(await guardarIntervencion({ ...body, actorUserId: auth.userId }), { status: 201 });
});

/** PATCH /api/catalog/material/intervenciones/[id] — editarla (o apagarla). */
export const intervencionEditarHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  profile.requireOpcion("op.mant.voces_generar");
  const id = z.uuid().parse(await param(context, "id"));
  const body = intervencionSchema.parse(await request.json());
  return json(await guardarIntervencion({ ...body, id, actorUserId: auth.userId }));
});

/** DELETE /api/catalog/material/intervenciones/[id]. */
export const intervencionEliminarHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  profile.requireOpcion("op.mant.voces_generar");
  await eliminarIntervencion({
    actorUserId: auth.userId,
    id: z.uuid().parse(await param(context, "id")),
  });
  return json({ ok: true });
});

// —— Lo que pide el libro ——————————————————————————————————————————————

/**
 * GET /api/material/[id]/t/[token]/audios/[clave].mp3 — el audio de una frase,
 * que el libro pide por ruta relativa. SIN sesión, como los videos: la petición
 * sale de la caja sin cookie y la autoriza el token de la ruta (el mismo de los
 * videos, ligado a ESTE libro). Cualquier fallo, 404.
 *
 * Caché de un día: la clave nombra la FRASE, y regenerarla cambia lo que
 * responde (no es inmutable, pero cambia muy rara vez).
 */
export const vozLibroServirHandler = handler(async (request, context) => {
  const id = await param(context, "id");
  const token = await param(context, "token");
  const clave = leerNombreArchivoAudio(await param(context, "archivo"));
  const noEsta = () => new NotFoundError("Ese audio no existe.");

  if (!z.uuid().safeParse(id).success || clave === null) throw noEsta();
  if (!tokenVideosLibroValido(id, token)) throw noEsta();
  const material = await archivoDeMaterial(id);
  if (material === null || material.tipo !== "interactivo") throw noEsta();
  const fileId = await archivoVozGenerada(material.curso, material.nivel, clave);
  if (fileId === null) throw noEsta();

  const { bytes } = await descargarArchivo(fileId);
  return respuestaConRango(bytes, request.headers.get("range"), {
    "Content-Type": "audio/mpeg",
    "Cache-Control": "private, max-age=86400",
  });
});
