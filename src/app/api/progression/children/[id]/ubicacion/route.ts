import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { ubicarNino } from "@/modules/progression";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const schema = z.object({
  levelId: z.uuid(),
  lecciones: z.number().int().min(0).max(50),
  motivo: z.string().min(5).max(300),
});

/**
 * POST /api/progression/children/[id]/ubicacion — Academic Change › AJUSTE:
 * ubica al niño en otro nivel y/o lección de su MISMO curso. No edita el
 * avance: deja una entrada que la función central lee al derivar (regla 4).
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MATRICULAS_GESTIONAR);
  const params = await context.params;
  const childPersonId = z.uuid().parse(params["id"]);
  const body = schema.parse(await request.json());
  return json(
    await ubicarNino({
      childPersonId,
      levelId: body.levelId,
      lecciones: body.lecciones,
      motivo: body.motivo,
      actorUserId: auth.userId,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
