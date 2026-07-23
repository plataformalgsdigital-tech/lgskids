import { z } from "zod";
import { PERMISOS, asignarRol, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const bodySchema = z.object({
  userId: z.uuid(),
  roleCode: z.string().min(1),
  countryCode: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase())
    .nullable(),
});

/** POST /api/access/user-roles — asigna un rol (requiere roles.asignar). */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ROLES_ASIGNAR);

  const body = bodySchema.parse(await request.json());
  await asignarRol({
    actorUserId: auth.userId,
    userId: body.userId,
    roleCode: body.roleCode,
    countryCode: body.countryCode,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true }, { status: 201 });
});
