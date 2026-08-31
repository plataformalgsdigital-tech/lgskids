import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { crearEventoAdmin, eventosAdmin } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Eventos ADMINISTRATIVOS: reuniones y capacitaciones cuya audiencia son guías.
 *
 * Crear exige `eventos.crear` (solo administración). LEER no: un guía debe ver
 * los suyos, y por eso la consulta se acota a él cuando no gestiona salones.
 */

const rangoSchema = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Fecha YYYY-MM-DD.");

export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const q = request.nextUrl.searchParams;
  const desde = rangoSchema.parse(q.get("from"));
  const hasta = rangoSchema.parse(q.get("to"));
  const soloSuyos =
    profile.hasPermission(PERMISOS.PANEL_GUIA) &&
    !profile.hasPermission(PERMISOS.SALONES_GESTIONAR);
  return json({ eventos: await eventosAdmin(desde, hasta, soloSuyos ? auth.userId : null) });
});

const crearSchema = z.object({
  tipo: z.enum(["SESION", "CLUB", "TALLER"]),
  titulo: z.string().max(200).nullish(),
  fecha: rangoSchema,
  horaLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
  duracionMin: z.number().int().min(15).max(300).default(60),
  pais: z.enum(["CL", "CO", "EC", "PE"]),
  campania: z.string().max(120).nullish(),
  curso: z.string().max(40).nullish(),
  classroomId: z.uuid().nullish(),
  nivel: z.string().max(40).nullish(),
  limiteUsuarios: z.number().int().min(1).max(500).nullish(),
  observaciones: z.string().max(1000).nullish(),
  guiaUserIds: z.array(z.uuid()).min(1),
});

export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const body = crearSchema.parse(await request.json());
  const resultado = await crearEventoAdmin({
    actorUserId: auth.userId,
    tipo: body.tipo,
    titulo: body.titulo ?? null,
    fecha: body.fecha,
    horaLocal: body.horaLocal,
    duracionMin: body.duracionMin,
    pais: body.pais,
    campania: body.campania ?? null,
    curso: body.curso ?? null,
    classroomId: body.classroomId ?? null,
    nivel: body.nivel ?? null,
    limiteUsuarios: body.limiteUsuarios ?? null,
    observaciones: body.observaciones ?? null,
    guiaUserIds: body.guiaUserIds,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado, { status: 201 });
});
