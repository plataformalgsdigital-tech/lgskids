import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  CRITERIOS_PROYECTO,
  ENTREGAS_BASE,
  ENTREGAS_TOPE,
  PUNTOS_MINIMOS,
  autorizarEntregaExtra,
  exigirNinoDelGuia,
  libroDeNino,
  nivelDeNino,
  nivelesConLibro,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** El niño de la ruta, comprobado: es de un salón del guía (o lo mira coordinación). */
async function alcance(auth: { userId: string }, childPersonIdCrudo: unknown) {
  const profile = await getAccessProfile(auth.userId);
  const coordina = profile.hasPermission(PERMISOS.SALONES_GESTIONAR);
  if (!coordina) profile.requirePermission(PERMISOS.PANEL_GUIA);
  const childPersonId = z.uuid().parse(childPersonIdCrudo);
  await exigirNinoDelGuia(childPersonId, {
    userId: auth.userId,
    puedeGestionarCualquierSalon: coordina,
  });
  const nivel = await nivelDeNino(childPersonId);
  if (nivel === null) throw new NotFoundError("El niño no tiene una matrícula activa.");
  return { profile, childPersonId, nivel };
}

/**
 * GET /api/guia/alumnos/[childPersonId]/libro?nivel= — el libro del niño en un
 * nivel: lo que reportó de evaluaciones y juegos, y sus proyectos con las
 * entregas y revisiones. Sin `nivel`, el que está trabajando.
 */
export const GET = handlerWithAuth(async (request, auth, context) => {
  const { childPersonId, nivel } = await alcance(auth, (await context.params)["childPersonId"]);
  const conDatos = await nivelesConLibro(childPersonId);
  // Los niveles que puede abrir y los que ya tienen algo guardado.
  const niveles = [...new Set([...nivel.alcanzados, ...conDatos])];
  const pedido = request.nextUrl.searchParams.get("nivel")?.toUpperCase() ?? nivel.actual;
  if (!niveles.includes(pedido)) throw new ValidationError("Ese nivel no es del alumno.");
  return json({
    curso: nivel.curso,
    actual: nivel.actual,
    niveles,
    libro: await libroDeNino(childPersonId, nivel.curso, pedido),
    reglas: {
      criterios: CRITERIOS_PROYECTO,
      puntosMinimos: PUNTOS_MINIMOS,
      entregasBase: ENTREGAS_BASE,
      entregasTope: ENTREGAS_TOPE,
    },
  });
});

const autorizacionSchema = z.object({
  nivel: z.string().min(3).max(20),
  unidad: z.number().int().min(1).max(4),
  maximo: z.number().int().min(4).max(99),
});

/**
 * POST — autoriza otra oportunidad de entrega (`maximo` = total permitido).
 * Revisar y autorizar es trabajo del guía: `evaluaciones.gestionar`.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const { profile, childPersonId, nivel } = await alcance(
    auth,
    (await context.params)["childPersonId"],
  );
  profile.requirePermission(PERMISOS.EVALUACIONES_GESTIONAR);
  const body = autorizacionSchema.parse(await request.json());
  const nivelPedido = body.nivel.toUpperCase();
  if (!nivel.alcanzados.includes(nivelPedido)) {
    throw new ValidationError("Ese nivel no es del alumno.");
  }
  return json(
    await autorizarEntregaExtra({
      actorUserId: auth.userId,
      childPersonId,
      curso: nivel.curso,
      nivel: nivelPedido,
      unidad: body.unidad,
      maximo: body.maximo,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
