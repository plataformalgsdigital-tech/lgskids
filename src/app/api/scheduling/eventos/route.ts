import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { MAX_SALONES_COMPARTIDOS, crearEvento, guiasConZoom } from "@/modules/scheduling";
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
  return json({ guias: await guiasConZoom() });
});

const crearSchema = z.object({
  classroomIds: z.array(z.uuid()).min(1).max(MAX_SALONES_COMPARTIDOS),
  tipo: z.enum(["SESION", "CLUB", "TALLER"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe ser YYYY-MM-DD."),
  horaLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
  duracionMin: z.number().int().min(15).max(300).default(60),
  nivel: z.string().max(40).nullish(),
  limiteUsuarios: z.number().int().min(1).max(200).nullish(),
  guiaUserId: z.uuid(),
  observaciones: z.string().max(1000).nullish(),
});

/** POST — crea el evento (uno por salón si se comparte entre cursos). */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const body = crearSchema.parse(await request.json());
  const resultado = await crearEvento({
    actorUserId: auth.userId,
    classroomIds: body.classroomIds,
    tipo: body.tipo,
    fecha: body.fecha,
    horaLocal: body.horaLocal,
    duracionMin: body.duracionMin,
    nivel: body.nivel ?? null,
    limiteUsuarios: body.limiteUsuarios ?? null,
    guiaUserId: body.guiaUserId,
    observaciones: body.observaciones ?? null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado, { status: 201 });
});
