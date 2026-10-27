import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { editarLinkClub, eliminarLinkClub } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const editarSchema = z.object({
  nombre: z.string().max(120),
  diaSemana: z.number().int().min(0).max(6),
  horario: z.string().max(60),
  link: z.string().max(500),
  activo: z.boolean(),
});

/** PATCH — edita un link (también lo activa o desactiva). */
export const PATCH = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  profile.requireOpcion("op.sesiones.links_clubes");
  const id = z.uuid().parse((await context.params)["id"]);
  const body = editarSchema.parse(await request.json());
  await editarLinkClub({
    ...body,
    id,
    actorUserId: auth.userId,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true });
});

/** DELETE — borra un link que ninguna sesión usó (si no, 409: desactivarlo). */
export const DELETE = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  profile.requireOpcion("op.sesiones.links_clubes");
  const id = z.uuid().parse((await context.params)["id"]);
  await eliminarLinkClub({
    id,
    actorUserId: auth.userId,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true });
});
