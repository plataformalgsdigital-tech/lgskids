import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity, crearUsuarioStaff, listarUsuarios } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const crearSchema = z.object({
  username: z.string().min(3).max(40),
  email: z.email().nullish(),
  roleCode: z.string().min(3).max(30).nullish(),
  countryCode: z.string().length(2).nullish(),
});

/** POST /api/identity/users — crea un usuario de staff (credenciales una vez). */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  const body = crearSchema.parse(await request.json());
  const resultado = await crearUsuarioStaff({
    actorUserId: auth.userId,
    username: body.username,
    email: body.email ?? null,
    roleCode: body.roleCode ?? null,
    countryCode: body.countryCode?.toUpperCase() ?? null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado, { status: 201 });
});

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
