import { getAccessProfile } from "@/modules/access";
import { TEMAS_TABLAS, listarTablas } from "@/modules/dbadmin";
import { bootstrapIdentity } from "@/modules/identity";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/dbadmin/tablas — las tablas de la base.
 *
 * SOLO el ROL superadmin, como la bóveda de claves: ningún permiso marcable
 * en el panel lo concede, así que un admin con todos los permisos tampoco
 * entra. Esto abre la base entera; no puede depender de una casilla.
 */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  if (!profile.esSuperadmin) {
    throw new ForbiddenError("Solo el superadmin puede abrir la base de datos.");
  }
  return json(
    { tablas: await listarTablas(), temas: TEMAS_TABLAS },
    { headers: { "Cache-Control": "no-store" } },
  );
});
