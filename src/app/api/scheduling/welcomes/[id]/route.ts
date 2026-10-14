import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { detalleWelcome, editarWelcome, eliminarWelcome } from "@/modules/scheduling";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { welcomeSchema } from "../esquema";

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

/**
 * EDITAR un Welcome (`eventos.crear`), aunque tenga niños agendados: conservan
 * su reserva. No se baja el límite por debajo de los ya agendados.
 */
export const PATCH = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const id = z.uuid().parse((await context.params)["id"]);
  const body = welcomeSchema.parse(await request.json());
  return json(
    await editarWelcome({
      actorUserId: auth.userId,
      id,
      ...body,
      observaciones: body.observaciones ?? null,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
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
