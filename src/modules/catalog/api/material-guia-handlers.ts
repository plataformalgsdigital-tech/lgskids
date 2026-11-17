import { NextResponse } from "next/server";
import { z } from "zod";
import { PERMISOS, getAccessProfile, type AccessProfile } from "@/modules/access";
import { descargarArchivo } from "@/modules/files";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { handler, handlerWithAuth, json } from "@/platform/http/handler";
import { origenPublico } from "@/platform/http/origen";
import { respuestaConRango } from "@/platform/http/rango";
import {
  archivoDeMaterialGuia,
  editarMaterialGuia,
  eliminarMaterialGuia,
  listarMaterialGuia,
  subirMaterialGuia,
  tokenOfficeParaItem,
  tokenOfficeValido,
} from "../application/material-guia";
import {
  AYUDA_POR_TAB,
  MINUTOS_TOKEN_OFFICE,
  TAMANO_MAXIMO_MATERIAL_GUIA,
  tabMaterialGuiaValida,
  urlVisorOffice,
} from "../domain/material-guia";

type Contexto = { params: Promise<Record<string, string | string[]>> };

async function param(context: Contexto, nombre: string): Promise<string> {
  const v = (await context.params)[nombre];
  return typeof v === "string" ? v : "";
}

/**
 * Ver el Material Guía lo puede quien ve el catálogo Y tiene su pantalla de
 * Mantenimiento o el botón del panel de la sesión (los guías tienen el segundo).
 */
function exigirVer(profile: AccessProfile): void {
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  if (
    !profile.hasPermission("op.mant.material_guia") &&
    !profile.hasPermission("op.calendario.contenido")
  ) {
    throw new ForbiddenError("No tienes acceso al Material Guía.");
  }
}

function exigirSubir(profile: AccessProfile): void {
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  profile.requireOpcion("op.mant.material_guia_subir");
}

/**
 * GET /api/catalog/material-guia?cursoId=&tab= — los ítems de una lección (de una
 * pestaña, si se pide). Los límites viajan resueltos para que la pantalla no copie cifras.
 */
export const materialGuiaListarHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  exigirVer(profile);
  const q = request.nextUrl.searchParams;
  const cursoId = z.uuid().parse(q.get("cursoId"));
  const tab = q.get("tab");
  if (tab !== null && tab !== "" && !tabMaterialGuiaValida(tab)) {
    throw new ValidationError("La pestaña es 'MATERIAL' o 'RECURSO'.");
  }
  return json({
    items: await listarMaterialGuia({
      cursoId,
      ...(tab !== null && tab !== "" && tabMaterialGuiaValida(tab) && { tab }),
    }),
    limites: { tamanoMaximo: TAMANO_MAXIMO_MATERIAL_GUIA, aceptan: AYUDA_POR_TAB },
  });
});

function textoForm(form: FormData, campo: string): string {
  const v = form.get(campo);
  return typeof v === "string" ? v : "";
}

/**
 * POST /api/catalog/material-guia — multipart: cursoId, tab, y uno o varios `archivo`
 * o un `enlace` (+ `titulo`, `orden`). Cada archivo es un ítem; si alguno falla los demás
 * se guardan y el fallo se informa (`errores`).
 */
export const materialGuiaSubirHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  exigirSubir(profile);
  const form = await request.formData().catch(() => null);
  if (form === null) {
    throw new ValidationError("Envía multipart/form-data con cursoId, tab y archivo o enlace.");
  }
  const cursoId = z.uuid().parse(textoForm(form, "cursoId"));
  const tab = textoForm(form, "tab");
  const titulo = textoForm(form, "titulo");
  const enlace = textoForm(form, "enlace");
  const ordenTexto = textoForm(form, "orden");
  const orden = ordenTexto.trim() === "" ? null : z.coerce.number().int().min(0).parse(ordenTexto);
  const archivos = form.getAll("archivo").filter((a): a is File => a instanceof File);
  if (archivos.length === 0 && enlace.trim() === "") {
    throw new ValidationError("Sube al menos un archivo o escribe un enlace.");
  }

  const creados: string[] = [];
  const errores: { nombre: string; mensaje: string }[] = [];
  const base = { actorUserId: auth.userId, cursoId, tab };
  for (const a of archivos) {
    try {
      const r = await subirMaterialGuia({
        ...base,
        // Con varios archivos cada uno toma su nombre: un título para todos no tiene sentido.
        ...(archivos.length === 1 && titulo.trim() !== "" && { titulo }),
        ...(archivos.length === 1 && orden !== null && { orden }),
        archivo: { nombre: a.name, bytes: Buffer.from(await a.arrayBuffer()) },
      });
      creados.push(r.id);
    } catch (e) {
      errores.push({
        nombre: a.name,
        mensaje: e instanceof AppError ? e.message : "No se pudo subir.",
      });
    }
  }
  if (enlace.trim() !== "") {
    try {
      const r = await subirMaterialGuia({
        ...base,
        ...(titulo.trim() !== "" && { titulo }),
        ...(orden !== null && archivos.length === 0 && { orden }),
        enlace,
      });
      creados.push(r.id);
    } catch (e) {
      errores.push({
        nombre: enlace,
        mensaje: e instanceof AppError ? e.message : "No se pudo guardar.",
      });
    }
  }
  if (creados.length === 0 && errores.length > 0) {
    throw new ValidationError(errores[0]?.mensaje ?? "No se pudo subir.");
  }
  return json({ creados, errores }, { status: 201 });
});

const editarSchema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  orden: z.number().int().min(0).optional(),
});

/** PATCH /api/catalog/material-guia/[id] — título u orden. */
export const materialGuiaEditarHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  exigirSubir(profile);
  const id = z.uuid().parse(await param(context, "id"));
  const body = editarSchema.parse(await request.json());
  await editarMaterialGuia({
    actorUserId: auth.userId,
    id,
    ...(body.titulo !== undefined && { titulo: body.titulo }),
    ...(body.orden !== undefined && { orden: body.orden }),
  });
  return json({ ok: true });
});

/** DELETE /api/catalog/material-guia/[id] — quita el ítem y su archivo. */
export const materialGuiaEliminarHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  exigirSubir(profile);
  await eliminarMaterialGuia({
    actorUserId: auth.userId,
    id: z.uuid().parse(await param(context, "id")),
  });
  return json({ ok: true });
});

/**
 * Sirve el archivo de un ítem. El PDF, la imagen y el video salen EN LÍNEA (para el
 * visor); la presentación sale como descarga (el botón "Abrir en PowerPoint"). El video
 * responde por rangos: sin eso no se puede adelantar y Safari no lo reproduce.
 */
async function servirArchivo(
  id: string,
  rango: string | null,
  forzarDescarga: boolean,
): Promise<NextResponse> {
  const item = await archivoDeMaterialGuia(id);
  if (item === null || item.fileId === null) throw new NotFoundError("Ese archivo no existe.");
  const { meta, bytes } = await descargarArchivo(item.fileId);
  const nombre = encodeURIComponent(meta.nombreOriginal);
  const enLinea = !forzarDescarga && item.tipo !== "PPT";
  const cabeceras = {
    "Content-Type": meta.mime,
    "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename*=UTF-8''${nombre}`,
    // Los bytes de un ítem no cambian nunca (quitarlo y subir otro crea otro id).
    "Cache-Control": "private, max-age=3600",
  };
  return item.tipo === "VIDEO" && enLinea
    ? respuestaConRango(bytes, rango, cabeceras)
    : new NextResponse(new Uint8Array(bytes), { headers: cabeceras });
}

/** GET /api/catalog/material-guia/[id]/archivo[?descargar=1] — con sesión. */
export const materialGuiaArchivoHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  exigirVer(profile);
  return servirArchivo(
    z.uuid().parse(await param(context, "id")),
    request.headers.get("range"),
    request.nextUrl.searchParams.get("descargar") === "1",
  );
});

/**
 * GET /api/catalog/material-guia/[id]/office — la dirección del visor de Office para la
 * web con el enlace TEMPORAL con que Microsoft baja la presentación (vence en
 * `MINUTOS_TOKEN_OFFICE`). Solo para presentaciones.
 */
export const materialGuiaOfficeHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  exigirVer(profile);
  const id = z.uuid().parse(await param(context, "id"));
  const item = await archivoDeMaterialGuia(id);
  if (item === null || item.tipo !== "PPT" || item.nombre === null) {
    throw new NotFoundError("Esa presentación no existe.");
  }
  const extension = item.nombre.toLowerCase().split(".").pop() ?? "pptx";
  const { token } = tokenOfficeParaItem(id);
  // La extensión va en la ruta: Office decide el tipo de documento por ella.
  const archivoUrl = `${origenPublico(request)}/api/material-guia/t/${token}/${id}/presentacion.${extension}`;
  return json({
    visorUrl: urlVisorOffice(archivoUrl),
    descargaUrl: `/api/catalog/material-guia/${id}/archivo?descargar=1`,
    venceEnMin: MINUTOS_TOKEN_OFFICE,
  });
});

/**
 * GET /api/material-guia/t/[token]/[id]/[archivo] — SIN sesión: la presentación que baja
 * Microsoft. La autoriza el token firmado de la ruta (ese ítem, hasta esa hora) y solo
 * sirve presentaciones; todo fallo responde 404 igual, sin decir por qué.
 */
export const materialGuiaPublicoHandler = handler(async (request, context) => {
  const noEsta = () => new NotFoundError("Ese archivo no existe.");
  const id = await param(context, "id");
  const token = await param(context, "token");
  if (!z.uuid().safeParse(id).success || !tokenOfficeValido(id, token)) throw noEsta();
  const item = await archivoDeMaterialGuia(id);
  if (item === null || item.tipo !== "PPT") throw noEsta();
  return servirArchivo(id, request.headers.get("range"), true).then((r) => {
    // Para Microsoft va en línea (el visor decide); sin sesión, nada de caché compartida.
    r.headers.set("Content-Disposition", "inline");
    r.headers.set("Cache-Control", "private, max-age=300");
    return r;
  });
});
