import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  DIAS_FESTIVOS_DEFECTO,
  DIAS_FESTIVOS_MAXIMO,
  festivosProximos,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/scheduling/festivos?dias= — Gestión Festivos: los feriados que vienen y, de
 * cada uno, los salones que no dictan clase y los niños de OTRO país que se quedan
 * sin ella. `salones.gestionar` + `op.sesiones.festivos`; los niños, con el alcance
 * por país del rol.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.sesiones.festivos");
  const { dias } = z
    .object({
      dias: z.coerce.number().int().min(1).max(DIAS_FESTIVOS_MAXIMO).default(DIAS_FESTIVOS_DEFECTO),
    })
    .parse({ dias: request.nextUrl.searchParams.get("dias") || undefined });
  return json({
    dias,
    festivos: await festivosProximos({ dias, countryScope: auth.countryScope }),
    puedeAprobar: profile.hasPermission("op.sesiones.festivos_aprobar"),
    puedeSobrecupo: profile.hasPermission("op.kids.agendar_sobrecupo"),
  });
});
