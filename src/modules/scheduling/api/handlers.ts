import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import {
  agenda,
  cambiarGuia,
  crearSalon,
  detalleSalon,
  editarSalon,
  eliminarSalon,
  listarSalones,
  misNinosDeGuia,
  obtenerDetalleSesion,
  regenerarSesiones,
  suspenderDia,
} from "../application/gestion-salones";
import {
  actualizarHorario,
  cambiarActivoHorario,
  crearHorario,
  eliminarHorario,
  listarHorarios,
} from "../application/horarios-catalogo";

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

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");

/** GET /api/scheduling/agenda?from=&to=&campaignId= — sesiones del mes (todos los salones). */
export const agendaHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const q = request.nextUrl.searchParams;
  const desde = fechaSchema.parse(q.get("from"));
  const hasta = fechaSchema.parse(q.get("to"));
  const campaignRaw = q.get("campaignId");
  const campaignId =
    campaignRaw !== null && campaignRaw !== "" ? z.uuid().parse(campaignRaw) : undefined;
  return json({ sesiones: await agenda({ desde, hasta, campaignId }) });
});

/** GET /api/scheduling/sessions/[sessionId] — detalle de sesión (evento + salón + guía). */
export const detalleSesionHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const params = await context.params;
  const sessionId = z.uuid().parse(params["sessionId"]);
  return json(await obtenerDetalleSesion(sessionId));
});

// ---- Panel del GUÍA (restringido al guía logueado) ----

/** GET /api/guia/agenda?from=&to= — sesiones de los salones del guía logueado. */
export const agendaGuiaHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_GUIA);
  const q = request.nextUrl.searchParams;
  const desde = fechaSchema.parse(q.get("from"));
  const hasta = fechaSchema.parse(q.get("to"));
  return json({ sesiones: await agenda({ desde, hasta, guiaUserId: auth.userId }) });
});

/** GET /api/guia/salones — salones asignados al guía logueado. */
export const misSalonesHandler = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_GUIA);
  return json({ salones: await listarSalones(undefined, auth.userId) });
});

/** GET /api/guia/ninos — niños matriculados en los salones del guía logueado. */
export const misNinosHandler = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_GUIA);
  return json({ ninos: await misNinosDeGuia(auth.userId) });
});

const cambiarGuiaSchema = z.object({ guiaUserId: z.uuid().nullable() });

/** POST /api/scheduling/classrooms/[id]/guide — cambia (o quita) el guía del salón. */
export const cambiarGuiaHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = await idFromContext(context);
  const body = cambiarGuiaSchema.parse(await request.json());
  await cambiarGuia({
    actorUserId: auth.userId,
    classroomId: id,
    guiaUserId: body.guiaUserId,
    ip: ip(request),
  });
  return json({ ok: true });
});

const editarSalonSchema = z.object({
  cupo: z.number().int().min(1).max(50).optional(),
  guiaUserId: z.uuid().nullable().optional(),
  activo: z.boolean().optional(),
});

/** PATCH /api/scheduling/classrooms/[id] — edita cupo, guía y/o activo. */
export const editarSalonHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = await idFromContext(context);
  const body = editarSalonSchema.parse(await request.json());
  await editarSalon({ actorUserId: auth.userId, classroomId: id, ...body, ip: ip(request) });
  return json({ ok: true });
});

/** DELETE /api/scheduling/classrooms/[id] — elimina el salón (si no tiene matrículas). */
export const eliminarSalonHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = await idFromContext(context);
  await eliminarSalon({ actorUserId: auth.userId, classroomId: id, ip: ip(request) });
  return json({ ok: true });
});

// ---- Catálogo de horarios (mantenimiento) ----

const crearHorarioSchema = z.object({
  tipoCurso: z.enum(["JUNIOR", "YOUNGSTER"]),
  grupoPais: z.enum(["01", "02"]),
  salonNumero: z.string().regex(/^\d{2}$/),
  etiqueta: z.string().min(2).max(60),
  orden: z.number().int().min(0).max(999).optional(),
  slots: z.array(slotSchema).min(1).max(4),
});

/** GET /api/scheduling/horarios?tipoCurso=&grupoPais=&activos=1 — lista del catálogo. */
export const listarHorariosHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const q = request.nextUrl.searchParams;
  const tipoCurso = q.get("tipoCurso");
  const grupoPais = q.get("grupoPais");
  const soloActivos = q.get("activos") === "1";
  return json({
    horarios: await listarHorarios({
      ...(tipoCurso !== null && tipoCurso !== "" && { tipoCurso }),
      ...(grupoPais !== null && grupoPais !== "" && { grupoPais }),
      soloActivos,
    }),
  });
});

/** POST /api/scheduling/horarios — crea un horario del catálogo. */
export const crearHorarioHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const body = crearHorarioSchema.parse(await request.json());
  const resultado = await crearHorario({ actorUserId: auth.userId, ...body, ip: ip(request) });
  return json(resultado, { status: 201 });
});

const actualizarHorarioSchema = z.object({
  tipoCurso: z.enum(["JUNIOR", "YOUNGSTER"]),
  grupoPais: z.enum(["01", "02"]),
  salonNumero: z.string().regex(/^\d{2}$/),
  etiqueta: z.string().min(2).max(60),
  orden: z.number().int().min(0).max(999).optional(),
  slots: z.array(slotSchema).min(1).max(4),
});

/** PUT /api/scheduling/horarios/[id] — edita un horario del catálogo. */
export const actualizarHorarioHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = await idFromContext(context);
  const body = actualizarHorarioSchema.parse(await request.json());
  await actualizarHorario({ actorUserId: auth.userId, horarioId: id, ...body, ip: ip(request) });
  return json({ ok: true });
});

/** DELETE /api/scheduling/horarios/[id] — elimina un horario del catálogo. */
export const eliminarHorarioHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = await idFromContext(context);
  await eliminarHorario({ actorUserId: auth.userId, horarioId: id, ip: ip(request) });
  return json({ ok: true });
});

const toggleHorarioSchema = z.object({ activo: z.boolean() });

/** PATCH /api/scheduling/horarios/[id] — activa/desactiva un horario. */
export const toggleHorarioHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const id = await idFromContext(context);
  const body = toggleHorarioSchema.parse(await request.json());
  await cambiarActivoHorario({
    actorUserId: auth.userId,
    horarioId: id,
    activo: body.activo,
    ip: ip(request),
  });
  return json({ ok: true });
});
