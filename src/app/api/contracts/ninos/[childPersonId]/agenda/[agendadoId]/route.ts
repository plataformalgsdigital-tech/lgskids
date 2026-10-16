import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { cancelarAgendadoNino } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** DELETE — cancela algo agendado al niño en otro salón (queda quién y cuándo). */
export const DELETE = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MATRICULAS_GESTIONAR);
  profile.requireOpcion("op.kids.agendar");
  const params = await context.params;
  await cancelarAgendadoNino({
    actorUserId: auth.userId,
    childPersonId: z.uuid().parse(params["childPersonId"]),
    countryScope: auth.countryScope,
    agendadoId: z.uuid().parse(params["agendadoId"]),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true });
});
