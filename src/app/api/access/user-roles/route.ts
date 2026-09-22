import { z } from "zod";
import { PERMISOS, asignarRol, getAccessProfile, quitarRol } from "@/modules/access";
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
  // `roles.asignar` no alcanza para TODO: la llave maestra solo la da otro
  // superadmin (antes un admin podía otorgársela a cualquiera).
  profile.requirePuedeOtorgarRol(body.roleCode);
  await asignarRol({
    actorUserId: auth.userId,
    userId: body.userId,
    roleCode: body.roleCode,
    countryCode: body.countryCode,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true }, { status: 201 });
});

/**
 * DELETE /api/access/user-roles — quita un rol. Hace falta lo mismo que para
 * otorgarlo y para administrar esa cuenta: un coordinador puede quitarle el
 * rol de guía a un guía, no el de admin a un admin.
 */
export const DELETE = handlerWithAuth(async (request, auth) => {
  const body = bodySchema.parse(await request.json());
  const [profile, otro] = await Promise.all([
    getAccessProfile(auth.userId),
    getAccessProfile(body.userId),
  ]);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  profile.requirePuedeOtorgarRol(body.roleCode);
  profile.requirePuedeGestionarCuentaDe(otro.roleCodes);
  await quitarRol({
    actorUserId: auth.userId,
    userId: body.userId,
    roleCode: body.roleCode,
    countryCode: body.countryCode,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true });
});
