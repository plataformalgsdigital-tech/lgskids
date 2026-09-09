import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { audienciaEventoAdmin, marcarAsistenciaEventoAdmin } from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Lista de asistencia de un evento ADMINISTRATIVO.
 *
 * Es de coordinación (`salones.gestionar`): pasa lista de quiénes de la
 * audiencia asistieron a la reunión o capacitación. No toca la asistencia de
 * los niños ni la progresión — son cosas distintas y viven en tablas
 * distintas a propósito.
 */

async function idDeRuta(context: { params: Promise<Record<string, string | string[]>> }) {
  const { id } = (await context.params) as { id?: string };
  if (typeof id !== "string" || id === "") {
    throw new ValidationError("Falta el identificador del evento.");
  }
  return id;
}

export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  return json({ audiencia: await audienciaEventoAdmin(await idDeRuta(context)) });
});

const cuerpo = z.object({
  marcas: z
    .array(z.object({ guiaUserId: z.uuid(), asistio: z.boolean().nullable() }))
    .min(1)
    .max(200),
});

export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const b = cuerpo.parse(await request.json());
  return json(
    await marcarAsistenciaEventoAdmin({
      actorUserId: auth.userId,
      eventoId: await idDeRuta(context),
      marcas: b.marcas,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
