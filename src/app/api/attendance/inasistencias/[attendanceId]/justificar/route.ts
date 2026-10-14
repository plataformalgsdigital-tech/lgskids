import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { LARGO_JUSTIFICACION, justificarInasistencia } from "@/modules/attendance";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * POST — Servicio › Asistencia › "Justificar": AUSENTE → JUSTIFICADO con el
 * motivo. Exige marcar asistencia Y ver personas (servicio, no el guía, que
 * justifica desde su sesión). Alcance por país.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const attendanceId = z.uuid().parse((await context.params)["attendanceId"]);
  const body = z
    .object({ justificacion: z.string().min(1).max(LARGO_JUSTIFICACION) })
    .parse(await request.json());
  return json(
    await justificarInasistencia({
      actorUserId: auth.userId,
      attendanceId,
      justificacion: body.justificacion,
      countryScope: auth.countryScope,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
