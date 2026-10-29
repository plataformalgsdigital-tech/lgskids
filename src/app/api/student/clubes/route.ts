import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  cancelarClubPropio,
  clubActualPropio,
  clubesPropios,
  inscribirClubPropio,
} from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { findPersonByUserId } from "@/modules/people";
import { NotFoundError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * "Inscripción Clubes" del panel del ALUMNO. El niño es SIEMPRE el de la sesión
 * (nunca un id del cuerpo): GET lista los clubes de la semana en curso que le
 * corresponden; POST lo inscribe en uno; DELETE (`?agendadoId=`) lo borra.
 */
async function ninoDeSesion(userId: string): Promise<string> {
  const persona = await findPersonByUserId(userId);
  if (persona === null) throw new NotFoundError("No encontramos tu registro.");
  return persona.id;
}

const ip = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const nino = await ninoDeSesion(auth.userId);
  // `actual`: el club en que ya está (UN niño, UN club), aunque no sea de esta semana.
  const [clubes, actual] = await Promise.all([clubesPropios(nino), clubActualPropio(nino)]);
  return json({ clubes, actual });
});

export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const body = z.object({ sessionId: z.uuid() }).parse(await request.json());
  return json(
    await inscribirClubPropio({
      userId: auth.userId,
      childPersonId: await ninoDeSesion(auth.userId),
      sessionId: body.sessionId,
      ip: ip(request),
    }),
  );
});

export const DELETE = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const agendadoId = z.uuid().parse(request.nextUrl.searchParams.get("agendadoId"));
  await cancelarClubPropio({
    userId: auth.userId,
    childPersonId: await ninoDeSesion(auth.userId),
    agendadoId,
    ip: ip(request),
  });
  return json({ ok: true });
});
