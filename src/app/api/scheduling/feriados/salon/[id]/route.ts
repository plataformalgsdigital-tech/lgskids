import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { regenerarSalonPendiente } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * POST /api/scheduling/feriados/salon/[id] — el botón "Regenerar" de un salón pendiente:
 * vuelve a comprobar los contratos y ajusta SOLO sus sesiones futuras.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.sesiones.feriados_crear");
  const { id } = z.object({ id: z.string().uuid() }).parse(await context.params);
  return json(
    await regenerarSalonPendiente({
      actorUserId: auth.userId,
      countryScope: auth.countryScope,
      classroomId: id,
      ip: request.headers.get("x-forwarded-for"),
    }),
  );
});
