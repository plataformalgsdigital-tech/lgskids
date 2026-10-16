import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { colisionesDeCampania } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Pestaña "Colisiones" de la ficha de campaña: guías con dos salones cuyas
 * sesiones futuras se pisan. Coordinación (`salones.gestionar`): es el
 * calendario de TODOS los guías.
 */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.mant.colisiones");
  const id = z.uuid().parse((await context.params)["id"]);
  return json({ colisiones: await colisionesDeCampania(id) });
});
