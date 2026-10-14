import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  NIVELES_WELCOME,
  NIVEL_WELCOME_DEFECTO,
  crearWelcome,
  listarWelcomes,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { fechaSchema, welcomeSchema } from "./esquema";

bootstrapIdentity();

/**
 * WELCOME: crear (`eventos.crear`, solo administración) y listar para el
 * calendario (`salones.ver`; el guía que no gestiona salones ve solo los que
 * dicta él).
 */

export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const q = request.nextUrl.searchParams;
  const soloSuyos =
    profile.hasPermission(PERMISOS.PANEL_GUIA) &&
    !profile.hasPermission(PERMISOS.SALONES_GESTIONAR);
  return json({
    welcomes: await listarWelcomes(
      fechaSchema.parse(q.get("from")),
      fechaSchema.parse(q.get("to")),
      soloSuyos ? auth.userId : null,
    ),
    niveles: NIVELES_WELCOME,
    nivelDefecto: NIVEL_WELCOME_DEFECTO,
  });
});

export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const body = welcomeSchema.parse(await request.json());
  const resultado = await crearWelcome({
    actorUserId: auth.userId,
    ...body,
    observaciones: body.observaciones ?? null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado, { status: 201 });
});
