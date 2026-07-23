import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { asistenciaPorSalonMes, contratosPorPais, ocupacionSalones } from "@/modules/reporting";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** GET /api/reporting/summary?mes=YYYY-MM — los tres reportes de la Fase 10. */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.REPORTES_VER);
  const mes = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(request.nextUrl.searchParams.get("mes"));

  const [asistencia, ocupacion, contratos] = await Promise.all([
    asistenciaPorSalonMes(mes),
    ocupacionSalones(),
    contratosPorPais(auth.countryScope),
  ]);
  return json({ mes, asistencia, ocupacion, contratos });
});
