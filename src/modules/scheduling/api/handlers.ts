import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import {
  crearSalon,
  detalleSalon,
  listarSalones,
  regenerarSesiones,
  suspenderDia,
} from "../application/gestion-salones";

const slotSchema = z.object({
  tipo: z.enum(["SESION", "CLUB"]),
  diaSemana: z.number().int().min(0).max(6),
  horaLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duracionMin: z.number().int().min(30).max(180).optional(),
});

const crearSchema = z.object({
  courseId: z.uuid(),
  nombre: z.string().min(2).max(60),
  guiaUserId: z.uuid().nullish(),
  cupo: z.number().int().min(1).max(50),
  meetingUrl: z.url().nullish(),
  timezone: z.string().min(3).max(40),
  holidayCountry: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase()),
  slots: z.array(slotSchema).min(1).max(4),
});

function ip(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function idFromContext(context: {
  params: Promise<Record<string, string | string[]>>;
}): Promise<string> {
  const params = await context.params;
  return z.uuid().parse(params["id"]);
}

/** POST /api/scheduling/classrooms — crea salón + horario + TODAS las sesiones. */
export const crearSalonHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const body = crearSchema.parse(await request.json());
  const resultado = await crearSalon({
    actorUserId: auth.userId,
    ...body,
    guiaUserId: body.guiaUserId ?? null,
    meetingUrl: body.meetingUrl ?? null,
    ip: ip(request),
  });
  return json(resultado, { status: 201 });
});

/** GET /api/scheduling/classrooms?courseId= */
export const listarSalonesHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const courseId = request.nextUrl.searchParams.get("courseId");
  const salones = await listarSalones(
    courseId !== null && courseId !== "" ? z.uuid().parse(courseId) : undefined,
  );
  return json({ salones });
});

/** GET /api/scheduling/classrooms/[id] — detalle con sesiones y fin REAL. */
export const detalleSalonHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const id = await idFromContext(context);
  return json(await detalleSalon(id));
});

/** POST /api/scheduling/classrooms/[id]/regenerate */
export const regenerarHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = await idFromContext(context);
  const resultado = await regenerarSesiones({
    actorUserId: auth.userId,
    classroomId: id,
    ip: ip(request),
  });
  return json(resultado);
});

const suspenderSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo: z.string().min(5).max(300),
});

/** POST /api/scheduling/classrooms/[id]/suspend — corre la sesión al final. */
export const suspenderHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = await idFromContext(context);
  const body = suspenderSchema.parse(await request.json());
  const resultado = await suspenderDia({
    actorUserId: auth.userId,
    classroomId: id,
    ...body,
    ip: ip(request),
  });
  return json(resultado);
});
