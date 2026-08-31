import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { crearInvitacionGuia, revocarInvitacionGuia } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Enlace de registro del guía: administración lo emite y se lo envía; el guía
 * completa su ficha en /nuevo-guia sin entrar al panel.
 *
 * El token se devuelve UNA vez, aquí. Después solo queda su hash en la base,
 * así que si se pierde el enlace hay que emitir otro (lo cual revoca el
 * anterior).
 */

const cuerpo = z.object({ guiaUserId: z.uuid() });

function ip(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  const b = cuerpo.parse(await request.json());
  const invitacion = await crearInvitacionGuia({
    actorUserId: auth.userId,
    guiaUserId: b.guiaUserId,
    ip: ip(request),
  });
  return json(invitacion, { status: 201 });
});

export const DELETE = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  const b = cuerpo.parse(await request.json());
  return json(
    await revocarInvitacionGuia({
      actorUserId: auth.userId,
      guiaUserId: b.guiaUserId,
      ip: ip(request),
    }),
  );
});
