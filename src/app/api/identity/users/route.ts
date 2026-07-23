import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity, listarUsuarios } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** GET /api/identity/users?buscar= — usuarios con sus roles. */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  const buscar = z
    .string()
    .max(60)
    .optional()
    .parse(request.nextUrl.searchParams.get("buscar") ?? undefined);
  return json({
    usuarios: await listarUsuarios({ ...(buscar !== undefined && { buscar }) }),
  });
});
