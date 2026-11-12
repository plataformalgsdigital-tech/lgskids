import { z } from "zod";
import { getAccessProfile } from "@/modules/access";
import { recuperarClavesDesdeLgs } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * POST { aplicar } — recupera desde LGS la copia de la bóveda de TODOS los niños
 * "Sin copia" que vienen de LGS (en el alcance por país). `aplicar: false` es la
 * prueba: comprueba y cuenta sin guardar. Nunca devuelve claves.
 */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  if (!profile.puedeVerClaves) throw new ForbiddenError("Solo quien puede ver claves.");
  const body = z.object({ aplicar: z.boolean() }).parse(await request.json());
  return json(
    await recuperarClavesDesdeLgs({
      actorUserId: auth.userId,
      countryScope: auth.countryScope,
      aplicar: body.aplicar,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
