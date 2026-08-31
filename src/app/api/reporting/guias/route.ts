import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { calcularGuiaMes, consolidarGuiaMes, leerGuiaMes } from "@/modules/reporting";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Reporte mensual de sesiones por guía.
 *
 * `?periodo=YYYY-MM&vivo=1` devuelve el cálculo al día; sin `vivo`, lo
 * consolidado. Sin `periodo`, TODO el histórico acumulado — que es lo que se
 * extrae para el informe.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.REPORTES_VER);
  const q = request.nextUrl.searchParams;
  const periodo = q.get("periodo");
  if (q.get("vivo") === "1" && periodo !== null) {
    return json({ periodo, vivo: true, filas: await calcularGuiaMes(periodo) });
  }
  return json({
    periodo,
    vivo: false,
    filas: await leerGuiaMes(periodo ?? undefined),
  });
});

const consolidarSchema = z.object({ periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

/** POST — congela el período en la tabla acumulativa. Idempotente. */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.REPORTES_VER);
  const body = consolidarSchema.parse(await request.json());
  return json(await consolidarGuiaMes(body.periodo));
});
