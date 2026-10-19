import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity, cambiarEstadoCuenta } from "@/modules/identity";
import { exigirSoloGuia } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * POST /api/scheduling/guias/[guiaUserId]/estado — { estado: ACTIVO | INACTIVO }.
 * Activa o desactiva al guía desde su ficha. Es el MISMO cambio de Usuarios y
 * roles (`cambiarEstadoCuenta`: desactivar cierra sus sesiones y queda en la
 * auditoría), acotado a cuentas que son SOLO de guía.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  profile.requireOpcion("op.guias.estado");
  const params = await context.params;
  const guiaUserId = z.uuid().parse(params["guiaUserId"]);
  const { estado } = z
    .object({ estado: z.enum(["ACTIVO", "INACTIVO"]) })
    .parse(await request.json());
  await exigirSoloGuia(guiaUserId);
  await cambiarEstadoCuenta({
    actorUserId: auth.userId,
    userId: guiaUserId,
    estado,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true, estado });
});
