import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { progresoDeNino } from "@/modules/progression";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** GET /api/progression/children/[id] — progreso, medallas y diploma del niño. */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PROGRESION_VER);
  const params = await context.params;
  const childPersonId = z.uuid().parse(params["id"]);
  return json(await progresoDeNino(childPersonId));
});
