import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { PAISES_FERIADO, previoFeriadoPropio } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * POST /api/scheduling/feriados/previo — qué pasaría al agregar o quitar un feriado
 * propio, SIN escribir nada: salones y sesiones afectados, el nuevo final de cada salón,
 * los niños cuyo contrato vence antes y los niños de otro país que quedan sin clase.
 */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.sesiones.feriados_crear");
  const body = z
    .object({
      accion: z.enum(["AGREGAR", "QUITAR"]),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      paises: z.array(z.enum(PAISES_FERIADO)).min(1),
    })
    .parse(await request.json());
  return json(await previoFeriadoPropio({ ...body, countryScope: auth.countryScope }));
});
