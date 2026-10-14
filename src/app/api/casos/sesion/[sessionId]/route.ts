import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { verificarAccesoGuia } from "@/modules/attendance";
import { reportesDeSesion } from "@/modules/casos";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET — los niños de la sesión que tienen un caso reportado en ella (el ⚠ de la
 * lista). Ver salones y, para el guía, que la sesión sea suya.
 */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const sessionId = z.uuid().parse((await context.params)["sessionId"]);
  await verificarAccesoGuia(sessionId, {
    userId: auth.userId,
    puedeGestionarCualquierSalon: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
  });
  return json({ reportes: await reportesDeSesion(sessionId) });
});
