import { z } from "zod";
import { PERMISOS, crearRol, getAccessProfile, listarRoles } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** GET /api/access/roles — catálogo de roles. */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ROLES_ASIGNAR);
  return json({ roles: await listarRoles() });
});

const crearSchema = z.object({
  nombre: z.string().min(3).max(40),
  descripcion: z.string().max(200).nullish(),
});

/** POST /api/access/roles — crea un rol nuevo (sin permisos; se marcan después). */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ROLES_ASIGNAR);
  const body = crearSchema.parse(await request.json());
  const resultado = await crearRol({
    actorUserId: auth.userId,
    nombre: body.nombre,
    descripcion: body.descripcion ?? null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado, { status: 201 });
});
