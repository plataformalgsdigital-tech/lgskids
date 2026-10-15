import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  MAX_VIDEOS_POR_TANDA,
  enviarVideosWelcome,
  guardarVideoWelcome,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const ip = (r: Request) => r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

/**
 * POST — manda el video de bienvenida al apoderado de los niños elegidos
 * (máx. 60 por tanda). Enviar mensajes Y ver personas; el servidor vuelve a
 * calcular quién es candidato, con el alcance por país de quien envía.
 */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const body = z
    .object({ childPersonIds: z.array(z.uuid()).min(1).max(MAX_VIDEOS_POR_TANDA) })
    .parse(await request.json());
  return json({
    resultados: await enviarVideosWelcome({
      actorUserId: auth.userId,
      childPersonIds: body.childPersonIds,
      countryScope: auth.countryScope,
      ip: ip(request),
    }),
  });
});

/** PUT — cambia el enlace del video (`catalogo.gestionar`, como el material). */
export const PUT = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const body = z.object({ enlace: z.string().min(8).max(500) }).parse(await request.json());
  await guardarVideoWelcome({ actorUserId: auth.userId, enlace: body.enlace, ip: ip(request) });
  return json({ ok: true });
});
