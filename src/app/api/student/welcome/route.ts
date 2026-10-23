import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { reagendarPropio, reagendarPropioOpciones } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { findPersonByUserId } from "@/modules/people";
import { NotFoundError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * "Reagendar Bienvenida" del panel del ALUMNO. El niño es SIEMPRE el de la
 * sesión (nunca un id del cuerpo): GET dice si tiene una Bienvenida por
 * reagendar y cuáles le sirven; POST la reagenda con la misma reserva de
 * Servicio.
 */
async function ninoDeSesion(userId: string): Promise<string> {
  const persona = await findPersonByUserId(userId);
  if (persona === null) throw new NotFoundError("No encontramos tu registro.");
  return persona.id;
}

export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const r = await reagendarPropioOpciones(await ninoDeSesion(auth.userId));
  return json({ ...r, motivo: null });
});

export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const body = z.object({ welcomeId: z.uuid() }).parse(await request.json());
  return json({
    welcome: await reagendarPropio({
      userId: auth.userId,
      childPersonId: await ninoDeSesion(auth.userId),
      welcomeId: body.welcomeId,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  });
});
