import { z } from "zod";
import { getAccessProfile } from "@/modules/access";
import { recuperarClavesDesdeLgs } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * POST — "↻ Recuperar copia desde LGS" de la ficha del niño: toma la clave inicial
 * que LGS guardó, la comprueba contra la cuenta y, si coincide, guarda su copia en
 * la bóveda. No cambia la clave. Quien puede VER claves (superadmin o
 * `usuarios.ver_clave`), porque es justo lo que habilita.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  if (!profile.puedeVerClaves) throw new ForbiddenError("Solo quien puede ver claves.");
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  const r = await recuperarClavesDesdeLgs({
    actorUserId: auth.userId,
    childPersonId,
    countryScope: auth.countryScope,
    aplicar: true,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ resultado: r.resultados[0]?.resultado ?? null });
});
