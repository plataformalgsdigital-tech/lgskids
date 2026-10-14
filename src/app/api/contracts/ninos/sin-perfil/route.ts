import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { ninosSinPerfil } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET — Servicio › Usuarios sin perfil creado: niños con contrato aprobado que
 * todavía no completaron su perfil (`personas.ver`, con alcance por país).
 * El envío del enlace va por la ruta de siempre de la ficha del niño.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const url = new URL(request.url);
  const q = z
    .object({
      campaignId: z.uuid().optional(),
      buscar: z.string().max(100).optional(),
    })
    .parse({
      campaignId: url.searchParams.get("campaignId") || undefined,
      buscar: url.searchParams.get("buscar") || undefined,
    });
  return json({
    ninos: await ninosSinPerfil({
      countryScope: auth.countryScope,
      campaignId: q.campaignId ?? null,
      buscar: q.buscar ?? null,
    }),
    puedeEnviar: profile.hasPermission(PERMISOS.MENSAJES_ENVIAR),
  });
});
