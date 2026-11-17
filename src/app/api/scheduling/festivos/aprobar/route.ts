import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { aprobarCambioFestivo } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const schema = z.object({
  childPersonId: z.uuid(),
  /** El feriado que se atiende: país y fecha. */
  pais: z.string().length(2),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** La clase a la que pasa (una de las sugeridas, o la que elige coordinación). */
  sessionId: z.uuid(),
  amplio: z.boolean().default(false),
  autorizarSobrecupo: z.boolean().default(false),
});

/**
 * POST /api/scheduling/festivos/aprobar — aprueba el cambio TEMPORAL: pasa al niño a
 * esa clase, solo ese día. Agendar exige además su propia opción (`op.kids.agendar`)
 * y el sobrecupo la suya, leída de la SESIÓN.
 */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requirePermission(PERMISOS.MATRICULAS_GESTIONAR);
  profile.requireOpcion("op.sesiones.festivos");
  profile.requireOpcion("op.sesiones.festivos_aprobar");
  profile.requireOpcion("op.kids.agendar");
  const body = schema.parse(await request.json());
  return json(
    await aprobarCambioFestivo({
      actorUserId: auth.userId,
      childPersonId: body.childPersonId,
      countryScope: auth.countryScope,
      pais: body.pais.toUpperCase(),
      fecha: body.fecha,
      sessionId: body.sessionId,
      amplio: body.amplio,
      autorizarSobrecupo: body.autorizarSobrecupo,
      puedeSobrecupo: profile.hasPermission("op.kids.agendar_sobrecupo"),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
    { status: 201 },
  );
});
