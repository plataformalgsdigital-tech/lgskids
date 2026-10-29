import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { suspenderEvento } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const ip = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

/**
 * POST — SUSPENDE un evento creado a mano (queda en el calendario, sin lista ni
 * registro), con motivo. DELETE — lo reactiva. `salones.gestionar` y la opción
 * "Suspender un día", como la suspensión de una clase del horario.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.calendario.suspender");
  const sessionId = z.uuid().parse((await context.params)["sessionId"]);
  const body = z.object({ motivo: z.string().trim().min(1).max(500) }).parse(await request.json());
  return json(
    await suspenderEvento({
      actorUserId: auth.userId,
      sessionId,
      motivo: body.motivo,
      ip: ip(request),
    }),
  );
});

export const DELETE = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.calendario.suspender");
  const sessionId = z.uuid().parse((await context.params)["sessionId"]);
  return json(
    await suspenderEvento({ actorUserId: auth.userId, sessionId, motivo: null, ip: ip(request) }),
  );
});
