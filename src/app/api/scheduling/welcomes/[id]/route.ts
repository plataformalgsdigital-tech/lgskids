import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { detalleWelcome, eliminarWelcome } from "@/modules/scheduling";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** Detalle del Welcome con los niños agendados; el guía ve solo los que dicta. */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const id = z.uuid().parse((await context.params)["id"]);
  const detalle = await detalleWelcome(id);
  if (
    !profile.hasPermission(PERMISOS.SALONES_GESTIONAR) &&
    detalle.welcome.guiaUserId !== auth.userId
  ) {
    throw new ForbiddenError("Este Welcome lo dicta otro guía.");
  }
  return json({
    ...detalle,
    puedeEliminar: profile.hasPermission(PERMISOS.EVENTOS_CREAR),
    puedeMarcar: profile.hasPermission(PERMISOS.ASISTENCIA_GESTIONAR),
  });
});

/** Borrar: solo sin niños agendados. */
export const DELETE = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const id = z.uuid().parse((await context.params)["id"]);
  await eliminarWelcome({
    actorUserId: auth.userId,
    id,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true });
});
