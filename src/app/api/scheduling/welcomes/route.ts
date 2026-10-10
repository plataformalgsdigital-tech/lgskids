import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  CURSOS_WELCOME,
  DURACION_WELCOME_MAX,
  DURACION_WELCOME_MIN,
  LIMITE_WELCOME_MAX,
  NIVELES_WELCOME,
  NIVEL_WELCOME_DEFECTO,
  PAISES_WELCOME,
  crearWelcome,
  listarWelcomes,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * WELCOME: crear (`eventos.crear`, solo administración) y listar para el
 * calendario (`salones.ver`; el guía que no gestiona salones ve solo los que
 * dicta él).
 */

const fechaSchema = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Fecha YYYY-MM-DD.");

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

const crearSchema = z.object({
  fecha: fechaSchema,
  horaLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
  // Zona IANA del navegador de quien crea: el Welcome es un instante.
  zona: z.string().min(1).max(64),
  duracionMin: z.number().int().min(DURACION_WELCOME_MIN).max(DURACION_WELCOME_MAX),
  guiaUserId: z.uuid(),
  // null = todas.
  campaignId: z.uuid().nullable(),
  pais: z.enum(PAISES_WELCOME).nullable(),
  curso: z.enum(CURSOS_WELCOME).nullable(),
  classroomId: z.uuid().nullable(),
  nivel: z.enum(NIVELES_WELCOME).default(NIVEL_WELCOME_DEFECTO),
  limiteUsuarios: z.number().int().min(1).max(LIMITE_WELCOME_MAX),
  observaciones: z.string().max(1000).nullish(),
});

export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const body = crearSchema.parse(await request.json());
  const resultado = await crearWelcome({
    actorUserId: auth.userId,
    ...body,
    observaciones: body.observaciones ?? null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado, { status: 201 });
});
