import { NextResponse } from "next/server";
import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { cambiarFotoGuia, fotoDeGuia } from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/scheduling/guias/[guiaUserId]/foto — foto del guía.
 *
 * Quién la ve: el propio guía (su panel se la muestra) y quien administra las
 * fichas (`usuarios.gestionar`, que es quien ve la lista de Guías). No es arte
 * curricular: es la foto de una persona, así que no se abre a cualquier sesión.
 *
 * La caché es de una hora, NO inmutable: al reemplazar la foto el guía conserva
 * su id, así que la URL no cambia y un año de caché dejaría la cara vieja.
 */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const params = await context.params;
  const guiaUserId = z.uuid().parse(params["guiaUserId"]);
  if (guiaUserId !== auth.userId) {
    const profile = await getAccessProfile(auth.userId);
    profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  }
  const { meta, bytes } = await fotoDeGuia(guiaUserId);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

/**
 * POST — cambia la foto desde la ficha del guía (multipart, campo `foto`).
 * Es parte de EDITAR la ficha: `usuarios.gestionar` + `op.guias.ficha_editar`.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  profile.requireOpcion("op.guias.ficha_editar");
  const params = await context.params;
  const guiaUserId = z.uuid().parse(params["guiaUserId"]);
  const form = await request.formData().catch(() => null);
  const archivo = form?.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) {
    throw new ValidationError("Elige la foto (JPG, PNG o WebP).");
  }
  const r = await cambiarFotoGuia({
    actorUserId: auth.userId,
    guiaUserId,
    foto: {
      nombreOriginal: archivo.name,
      mime: archivo.type,
      bytes: Buffer.from(await archivo.arrayBuffer()),
    },
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(r);
});
