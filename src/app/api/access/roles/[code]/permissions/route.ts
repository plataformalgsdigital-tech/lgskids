import { z } from "zod";
import {
  MAX_PERMISOS_POR_ROL,
  PERMISOS,
  actualizarPermisosDeRol,
  getAccessProfile,
  permisosDeRol,
} from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

async function codeFromContext(context: {
  params: Promise<Record<string, string | string[]>>;
}): Promise<string> {
  const params = await context.params;
  return z
    .string()
    .regex(/^[a-z0-9_]{3,30}$/)
    .parse(params["code"]);
}

/** GET — catálogo de permisos con marca de cuáles tiene el rol. */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ROLES_ASIGNAR);
  return json(await permisosDeRol(await codeFromContext(context)));
});

const putSchema = z.object({
  permisos: z.array(z.string().min(3)).max(MAX_PERMISOS_POR_ROL),
});

/** PUT — reemplaza los permisos del rol por los marcados. */
export const PUT = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ROLES_ASIGNAR);
  profile.requireOpcion("op.usuarios.tab_roles");
  const body = putSchema.parse(await request.json());
  await actualizarPermisosDeRol({
    actorUserId: auth.userId,
    roleCode: await codeFromContext(context),
    permisos: body.permisos,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true });
});
