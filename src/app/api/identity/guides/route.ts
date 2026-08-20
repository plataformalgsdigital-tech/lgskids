import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity, listarGuias } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/identity/guides — usuarios con rol `guia`, para el selector de guía
 * al crear salones. Guardado con SALONES_GESTIONAR (permiso del wizard), no con
 * USUARIOS_GESTIONAR: elegir guía es una operación de salón.
 */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  return json({ guias: await listarGuias() });
});
