import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { buscarContratos } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { listarNinos, listarPersonas } from "@/modules/people";
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

  const verPersonas = profile.hasPermission(PERMISOS.PERSONAS_VER);
  const [ninos, personas, contratos] = await Promise.all([
    // Los NIÑOS van aparte y con su programa (contrato, campaña, curso,
    // estado): es lo que se busca casi siempre, y la línea de "persona" a
    // secas obligaba a abrir la ficha para saber en qué programa está.
    verPersonas
      ? listarNinos({ countryScope: auth.countryScope, buscar: q, limit: 10 })
      : Promise.resolve([]),
    verPersonas
      ? listarPersonas({ countryScope: auth.countryScope, buscar: q, limit: 10 })
      : Promise.resolve([]),
    profile.hasPermission(PERMISOS.CONTRATOS_VER)
      ? buscarContratos({ q, countryScope: auth.countryScope, limit: 10 })
      : Promise.resolve([]),
  ]);
  const idsNinos = new Set(ninos.map((n) => n.id));

  return json({
    q,
    ninos,
    // Las demás personas (apoderados, titulares): sin repetir a los niños.
    personas: personas.filter((p) => !idsNinos.has(p.id)),
    // Y los contratos de esos mismos niños ya van en su tarjeta.
    contratos: contratos.filter((c) => !idsNinos.has(c.beneficiarioId)),
  });
});
