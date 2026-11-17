import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  PAISES_FERIADO,
  crearFeriadoPropio,
  feriadosDelMes,
  quitarFeriadoPropio,
  salonesPendientesDeFeriados,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const paises = z.array(z.enum(PAISES_FERIADO)).min(1);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * GET /api/scheduling/feriados?mes=YYYY-MM — los feriados del mes (todos los países) y
 * los salones pendientes de ajustar. `salones.gestionar` + `op.sesiones.feriados`.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.sesiones.feriados");
  const hoy = new Date().toISOString().slice(0, 7);
  const { mes } = z
    .object({ mes: z.string().regex(/^\d{4}-\d{2}$/) })
    .parse({ mes: request.nextUrl.searchParams.get("mes") || hoy });
  const puedeCrear = profile.hasPermission("op.sesiones.feriados_crear");
  return json({
    mes,
    feriados: await feriadosDelMes(mes),
    puedeCrear,
    pendientes: puedeCrear ? await salonesPendientesDeFeriados(auth.countryScope) : [],
  });
});

/** POST — crea un feriado propio (nombre obligatorio, uno o varios países) y ajusta los salones. */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.sesiones.feriados_crear");
  const body = z
    .object({ fecha, nombre: z.string().trim().min(1).max(200), paises })
    .parse(await request.json());
  return json(
    await crearFeriadoPropio({
      actorUserId: auth.userId,
      countryScope: auth.countryScope,
      ...body,
      ip: request.headers.get("x-forwarded-for"),
    }),
    { status: 201 },
  );
});

/** DELETE — quita un feriado propio futuro (solo los de fuente MANUAL). */
export const DELETE = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.sesiones.feriados_crear");
  const body = z.object({ fecha, paises }).parse(await request.json());
  return json(
    await quitarFeriadoPropio({
      actorUserId: auth.userId,
      countryScope: auth.countryScope,
      ...body,
      ip: request.headers.get("x-forwarded-for"),
    }),
  );
});
