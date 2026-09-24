import { after } from "next/server";
import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { descargarArchivo } from "@/modules/files";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { handler, handlerWithAuth, json } from "@/platform/http/handler";
import { respuestaConRango } from "@/platform/http/rango";
import { archivoDeMaterial } from "../application/material";
import {
  archivoDeVideoLibro,
  archivoVideoPublicado,
  confirmarVideoLibro,
  eliminarVideoLibro,
  listarVideosLibro,
  procesarVideoLibro,
  registrarVideoSubido,
  tokenVideosLibroValido,
} from "../application/video-libro";
import {
  DURACION_MAXIMA_VIDEO_SEG,
  ORDEN_MAX,
  PAGINA_MAX,
  PAGINA_MIN,
  TAMANO_MAXIMO_VIDEO_SUBIDA,
  leerNombreArchivoVideo,
} from "../domain/video-libro";

type Contexto = { params: Promise<Record<string, string | string[]>> };

async function param(context: Contexto, nombre: string): Promise<string> {
  const v = (await context.params)[nombre];
  return typeof v === "string" ? v : "";
}

const uuid = (v: string) => z.uuid().parse(v);

// —— Mantenimiento (equipo) ————————————————————————————————————————————

/** GET /api/catalog/material/videos?curso=&nivel= — los videos del nivel. */
export const videosLibroListarHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const q = request.nextUrl.searchParams;
  return json({
    videos: await listarVideosLibro(q.get("curso") ?? "", q.get("nivel") ?? ""),
    // Los límites viajan resueltos para que la pantalla no copie las cifras.
    limites: {
      tamanoSubida: TAMANO_MAXIMO_VIDEO_SUBIDA,
      duracionMaximaSeg: DURACION_MAXIMA_VIDEO_SEG,
      paginaMin: PAGINA_MIN,
      paginaMax: PAGINA_MAX,
      ordenMax: ORDEN_MAX,
    },
  });
});

/**
 * POST /api/catalog/material/videos — multipart (curso, nivel, pagina, orden,
 * archivo). Responde 202 en cuanto el original queda guardado; la compresión
 * corre con `after()`, DESPUÉS de la respuesta, y la pantalla consulta el estado.
 */
export const videosLibroSubirHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (form === null || !(archivo instanceof File)) {
    throw new ValidationError(
      "Envía multipart/form-data con curso, nivel, pagina, orden y 'archivo'.",
    );
  }
  const texto = (c: string) => {
    const v = form.get(c);
    return typeof v === "string" ? v : "";
  };
  const { id, temporal } = await registrarVideoSubido({
    actorUserId: auth.userId,
    curso: texto("curso"),
    nivel: texto("nivel"),
    pagina: Number(texto("pagina")),
    orden: Number(texto("orden") || "1"),
    nombreOriginal: archivo.name,
    bytes: Buffer.from(await archivo.arrayBuffer()),
  });
  after(() => procesarVideoLibro(id, temporal));
  return json({ id, estado: "PROCESANDO" }, { status: 202 });
});

/** POST /api/catalog/material/videos/[id]/confirmar — publica (y reemplaza). */
export const videoLibroConfirmarHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const id = uuid(await param(context, "id"));
  return json(await confirmarVideoLibro({ actorUserId: auth.userId, id }));
});

/** DELETE /api/catalog/material/videos/[id] — borra (descarta o despublica). */
export const videoLibroEliminarHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const id = uuid(await param(context, "id"));
  await eliminarVideoLibro({ actorUserId: auth.userId, id });
  return json({ ok: true });
});

/**
 * GET /api/catalog/material/videos/[id]/ver — el previo del equipo, en
 * cualquier estado con archivo. La URL es del video, que no cambia nunca:
 * caché inmutable.
 */
export const videoLibroPrevioHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const id = uuid(await param(context, "id"));
  const fileId = await archivoDeVideoLibro(id);
  if (fileId === null) throw new NotFoundError("Ese video todavía no tiene archivo.");
  const { bytes } = await descargarArchivo(fileId);
  return respuestaConRango(bytes, request.headers.get("range"), {
    "Content-Type": "video/mp4",
    "Cache-Control": "private, max-age=31536000, immutable",
  });
});

// —— Lo que pide el libro ——————————————————————————————————————————————

/**
 * GET /api/material/[id]/t/[token]/videos/[pagina]-[n].mp4 — el video que el
 * libro pide por su ruta relativa.
 *
 * SIN sesión, a propósito: la petición sale del libro aislado y el navegador no
 * le pone la cookie. La autorización es el TOKEN de la ruta (firmado, ligado a
 * este libro, con vencimiento), que solo emiten `/api/student/material` —tras
 * comprobar que el niño alcanzó ese nivel— y la vista previa del equipo.
 * Cualquier fallo responde 404, sin decir cuál: no se confirma nada a quien
 * pruebe tokens.
 *
 * Solo se sirve lo PUBLICADO: un borrador se revisa antes de que lo vea un niño.
 * Caché corta: la ruta es de la CASILLA y reemplazar el video cambia lo que
 * responde.
 */
export const videoLibroServirHandler = handler(async (request, context) => {
  const id = await param(context, "id");
  const token = await param(context, "token");
  const casilla = leerNombreArchivoVideo(await param(context, "archivo"));
  const noEsta = () => new NotFoundError("Ese video no existe.");

  if (!z.uuid().safeParse(id).success || casilla === null) throw noEsta();
  if (!tokenVideosLibroValido(id, token)) throw noEsta();
  const material = await archivoDeMaterial(id);
  if (material === null || material.tipo !== "interactivo") throw noEsta();
  const fileId = await archivoVideoPublicado(
    material.curso,
    material.nivel,
    casilla.pagina,
    casilla.orden,
  );
  if (fileId === null) throw noEsta();

  const { bytes } = await descargarArchivo(fileId);
  return respuestaConRango(bytes, request.headers.get("range"), {
    "Content-Type": "video/mp4",
    "Cache-Control": "private, max-age=600",
  });
});
