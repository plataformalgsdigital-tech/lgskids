import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { estadoPerfilNino, reenviarEnlacePerfil } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Perfil del niño en su ficha: si ya lo creó, el último enlace emitido y el
 * Welcome que agendó (GET, `personas.ver`); y "Reenviar enlace de perfil"
 * (POST, `mensajes.enviar`), que emite uno nuevo, revoca el anterior y lo
 * manda al apoderado. Ambos con alcance por país.
 */

export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  return json(await estadoPerfilNino(childPersonId, auth.countryScope));
});

export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  const r = await reenviarEnlacePerfil({
    actorUserId: auth.userId,
    childPersonId,
    countryScope: auth.countryScope,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(r, { status: r.enviado ? 200 : 502 });
});
