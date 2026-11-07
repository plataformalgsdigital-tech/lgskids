import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { duenoDeEntrega, exigirNinoDelGuia, revisarProyecto } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { NotFoundError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const esquema = z.object({
  decision: z.enum(["approved", "changes_requested"]),
  puntajes: z.array(z.number().int().min(0).max(2)).length(4),
  comentario: z.string().max(2000).nullish(),
});

/**
 * POST /api/guia/proyectos/[entregaId]/revision — el guía revisa un proyecto.
 *
 * Quién: el guía del salón del niño (o coordinación), con
 * `evaluaciones.gestionar`. El alcance se comprueba con el DUEÑO de la
 * entrega, nunca con lo que mande el cuerpo. La regla de la rúbrica (6/8 sin
 * ceros para aprobar, solo la última entrega) la aplica `revisarProyecto`.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVALUACIONES_GESTIONAR);
  const entregaId = z.uuid().parse((await context.params)["entregaId"]);
  const dueno = await duenoDeEntrega(entregaId);
  if (dueno === null) throw new NotFoundError("La entrega no existe.");
  await exigirNinoDelGuia(dueno.childPersonId, {
    userId: auth.userId,
    puedeGestionarCualquierSalon: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
  });
  const body = esquema.parse(await request.json());
  return json(
    await revisarProyecto({
      actorUserId: auth.userId,
      entregaId,
      decision: body.decision,
      puntajes: body.puntajes,
      comentario: body.comentario ?? null,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
