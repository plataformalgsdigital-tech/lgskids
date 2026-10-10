import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { guiaDeWelcome, marcarAsistenciaWelcome } from "@/modules/scheduling";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const schema = z.object({
  marcas: z
    .array(z.object({ childPersonId: z.uuid(), asistio: z.boolean().nullable() }))
    .min(1)
    .max(500),
});

/**
 * Pasar lista del Welcome. Se guarda en su propia reserva, NUNCA en
 * `attendance_attendance` (regla 4). El guía que no gestiona salones solo
 * marca los Welcome que dicta él.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
  const id = z.uuid().parse((await context.params)["id"]);
  if (
    !profile.hasPermission(PERMISOS.SALONES_GESTIONAR) &&
    (await guiaDeWelcome(id)) !== auth.userId
  ) {
    throw new ForbiddenError("Este Welcome lo dicta otro guía.");
  }
  const body = schema.parse(await request.json());
  return json(
    await marcarAsistenciaWelcome({
      actorUserId: auth.userId,
      id,
      marcas: body.marcas,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
