import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { getRegistroAbierto, setRegistroAbierto } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Enlace ABIERTO de registro de guías: una URL fija que se reparte y con la
 * que cada guía crea su cuenta.
 *
 * Exige `usuarios.gestionar`, lo mismo que emitir un enlace por persona:
 * prenderlo equivale a repartir altas de guía, y quien pueda hacerlo tiene que
 * poder crear guías de todas formas. La respuesta lleva la clave compartida en
 * claro, a propósito — hay que poder dictarla—, así que no se cachea.
 */

const cuerpo = z.object({
  activo: z.boolean(),
  codigo: z.string().max(60).default(""),
});

const sinCache = { headers: { "Cache-Control": "no-store" } };

export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  return json(await getRegistroAbierto(), sinCache);
});

export const PUT = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  const b = cuerpo.parse(await request.json());
  const estado = await setRegistroAbierto({
    actorUserId: auth.userId,
    activo: b.activo,
    codigo: b.codigo,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(estado, sinCache);
});
