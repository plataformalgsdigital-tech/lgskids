import { PERMISOS, getAccessProfile, listarRoles } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** GET /api/access/roles — catálogo de roles. */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ROLES_ASIGNAR);
  return json({ roles: await listarRoles() });
});
