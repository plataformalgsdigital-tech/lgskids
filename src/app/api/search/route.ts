import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { buscarContratos } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { listarPersonas } from "@/modules/people";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * BUSCADOR GLOBAL: número de contrato, número de documento, nombre,
 * apellido o username. Devuelve solo las secciones que el usuario puede
 * ver, respetando su alcance por país. Composición en la capa app
 * (people + contracts) para no acoplar módulos entre sí.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const q = z.string().min(2).max(60).parse(request.nextUrl.searchParams.get("q")?.trim());
  const profile = await getAccessProfile(auth.userId);

  const [personas, contratos] = await Promise.all([
    profile.hasPermission(PERMISOS.PERSONAS_VER)
      ? listarPersonas({ countryScope: auth.countryScope, buscar: q, limit: 10 })
      : Promise.resolve([]),
    profile.hasPermission(PERMISOS.CONTRATOS_VER)
      ? buscarContratos({ q, countryScope: auth.countryScope, limit: 10 })
      : Promise.resolve([]),
  ]);

  return json({ q, personas, contratos });
});
