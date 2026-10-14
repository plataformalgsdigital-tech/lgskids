import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { resolverCancelacion } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * POST — administración resuelve el aviso de cancelación del guía: aprobar
 * (con o sin reemplazo SOLO para esa sesión) o rechazar. `salones.gestionar`.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = z.uuid().parse((await context.params)["id"]);
  const body = z
    .object({
      aprobar: z.boolean(),
      reemplazoGuiaUserId: z.uuid().nullish(),
      nota: z.string().max(500).nullish(),
    })
    .parse(await request.json());
  return json(
    await resolverCancelacion({
      actorUserId: auth.userId,
      cancelacionId: id,
      aprobar: body.aprobar,
      reemplazoGuiaUserId: body.reemplazoGuiaUserId ?? null,
      nota: body.nota ?? null,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
