import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { casosAbiertosDeNino, casosDeNino, exigirReporteDesdeSesion } from "@/modules/casos";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET — los casos del niño.
 *  - Con `casos.ver`: todos (su ficha), abiertos primero.
 *  - El guía, con `?sessionId=` de SU sesión: solo los ABIERTOS, para elegir en
 *    el modal de reporte si suma o abre uno nuevo.
 */
export const GET = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (sessionId !== null) {
    profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
    await exigirReporteDesdeSesion({
      actorUserId: auth.userId,
      sessionId: z.uuid().parse(sessionId),
      childPersonId,
      puedeGestionarSalones: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
    });
    return json({ abiertos: await casosAbiertosDeNino(childPersonId) });
  }
  profile.requirePermission(PERMISOS.CASOS_VER);
  return json({ casos: await casosDeNino(childPersonId, auth.countryScope) });
});
