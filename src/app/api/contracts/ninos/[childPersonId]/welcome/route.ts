import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { agendarWelcomeNino, opcionesWelcomeNino } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Agendar el Welcome de un niño desde su FICHA (coordinación): los que le
 * sirven (GET, `personas.ver`) y agendar o cambiar (POST, `matriculas.gestionar`).
 * Con alcance por país.
 */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  return json({
    ...(await opcionesWelcomeNino(childPersonId, auth.countryScope)),
    puedeAgendar: profile.hasPermission("op.kids.agendar_welcome"),
  });
});

export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MATRICULAS_GESTIONAR);
  profile.requireOpcion("op.kids.agendar_welcome");
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  const body = z.object({ welcomeId: z.uuid() }).parse(await request.json());
  return json({
    welcome: await agendarWelcomeNino({
      actorUserId: auth.userId,
      childPersonId,
      welcomeId: body.welcomeId,
      countryScope: auth.countryScope,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  });
});
