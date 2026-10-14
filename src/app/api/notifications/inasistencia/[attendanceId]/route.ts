import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { enviarMensajeInasistencia, vistaInasistencia } from "@/modules/notifications";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Servicio › Asistencia › "WhatsApp": el aviso de inasistencia a la familia.
 * GET = a quién va y el texto propuesto; POST = enviarlo (el texto revisado).
 * El teléfono NUNCA viene de la pantalla: se deriva del niño de esa marca.
 * Exige enviar mensajes Y ver personas, con alcance por país.
 */
async function exigir(userId: string) {
  const profile = await getAccessProfile(userId);
  profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
}

export const GET = handlerWithAuth(async (_request, auth, context) => {
  await exigir(auth.userId);
  const attendanceId = z.uuid().parse((await context.params)["attendanceId"]);
  return json(await vistaInasistencia(attendanceId, auth.countryScope), {
    headers: { "Cache-Control": "no-store" },
  });
});

export const POST = handlerWithAuth(async (request, auth, context) => {
  await exigir(auth.userId);
  const attendanceId = z.uuid().parse((await context.params)["attendanceId"]);
  const body = z.object({ mensaje: z.string().min(1).max(1000) }).parse(await request.json());
  const r = await enviarMensajeInasistencia({
    actorUserId: auth.userId,
    attendanceId,
    mensaje: body.mensaje,
    countryScope: auth.countryScope,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(r, { status: r.ok ? 200 : 502 });
});
