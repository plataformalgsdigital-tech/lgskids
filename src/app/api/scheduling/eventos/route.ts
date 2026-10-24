import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  DURACIONES_TALLER,
  ESQUEMA_APERTURA,
  DURACION_ADMIN_MAX,
  DURACION_ADMIN_MIN,
  TIPOS_EVENTO_ADMIN,
  MAX_SALONES_COMPARTIDOS,
  crearEvento,
  salonesDelAlcance,
  guiasConZoom,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Eventos sueltos del calendario. Solo administración: el permiso
 * `eventos.crear` es propio, no se hereda de ver el calendario.
 */

/** GET — guías activos con su sala de Zoom, para el selector del formulario. */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  return json({
    guias: await guiasConZoom(),
    // Vocabulario y rangos DEL DOMINIO. Si la UI los copiara, añadir un tipo
    // dejaría el formulario y el filtro desfasados sin que nadie lo note.
    tiposAdmin: TIPOS_EVENTO_ADMIN,
    duracionAdmin: { min: DURACION_ADMIN_MIN, max: DURACION_ADMIN_MAX },
    duracionesTaller: DURACIONES_TALLER,
  });
});

const crearSchema = z.object({
  // Salones elegidos uno a uno, O `todos`: el alcance (null = "Todos") cuyos
  // salones activos se resuelven en el servidor.
  classroomIds: z.array(z.uuid()).max(MAX_SALONES_COMPARTIDOS).default([]),
  todos: z
    .object({
      campaignId: z.uuid().nullable(),
      pais: z.enum(["CL", "CO", "EC", "PE"]).nullable(),
      curso: z.enum(["JUNIOR", "YOUNGSTER"]).nullable(),
    })
    .optional(),
  // Zona IANA de quien escribe la hora (la manda el evento para "todos").
  zona: z.string().min(1).max(64).optional(),
  // Solo Club: se repite cada semana entre el inicio y el final de la tanda.
  tanda: z
    .object({
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Inicio de tanda YYYY-MM-DD."),
      fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Final de tanda YYYY-MM-DD."),
    })
    .nullish(),
  tipo: z.enum(["SESION", "CLUB", "TALLER"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe ser YYYY-MM-DD."),
  horaLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
  duracionMin: z.number().int().min(15).max(300).default(60),
  nivel: z.string().max(40).nullish(),
  limiteUsuarios: z.number().int().min(1).max(200).nullish(),
  guiaUserId: z.uuid(),
  observaciones: z.string().max(1000).nullish(),
  apertura: ESQUEMA_APERTURA.optional(),
});

/** POST — crea el evento (uno por salón si se comparte entre cursos). */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  profile.requireOpcion("op.calendario.evento_academico");
  const body = crearSchema.parse(await request.json());
  const resultado = await crearEvento({
    actorUserId: auth.userId,
    classroomIds:
      body.todos !== undefined ? await salonesDelAlcance(body.todos) : body.classroomIds,
    todos: body.todos !== undefined,
    tanda: body.tanda ?? null,
    ...(body.zona !== undefined && { zona: body.zona }),
    tipo: body.tipo,
    fecha: body.fecha,
    horaLocal: body.horaLocal,
    duracionMin: body.duracionMin,
    nivel: body.nivel ?? null,
    limiteUsuarios: body.limiteUsuarios ?? null,
    guiaUserId: body.guiaUserId,
    observaciones: body.observaciones ?? null,
    ...(body.apertura !== undefined && { apertura: body.apertura }),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado, { status: 201 });
});
