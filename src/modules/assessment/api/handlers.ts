import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { intentosDeNino, registrarIntento } from "../application/intentos";

const registrarSchema = z.object({
  childPersonId: z.uuid(),
  quizId: z.uuid(),
  score: z.number().int().min(0).max(100),
});

/** POST /api/assessment/attempts — registra y califica un intento. */
export const registrarIntentoHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVALUACIONES_GESTIONAR);
  const body = registrarSchema.parse(await request.json());
  const resultado = await registrarIntento({
    actorUserId: auth.userId,
    ...body,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado, { status: 201 });
});

/** GET /api/assessment/attempts?childPersonId= — historial de intentos. */
export const intentosHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVALUACIONES_VER);
  const childPersonId = z.uuid().parse(request.nextUrl.searchParams.get("childPersonId"));
  return json({ intentos: await intentosDeNino(childPersonId) });
});
