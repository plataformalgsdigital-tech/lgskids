import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { crearCampania } from "../application/crear-campania";
import { actualizarFechasCampania } from "../application/editar-campania";
import { detalleCampania, listarCampanias } from "../application/consultas";
import {
  actualizarReferenciaLeccion,
  actualizarReferenciaNivel,
  actualizarReferenciaQuiz,
  obtenerReferenciaLeccion,
  obtenerReferenciaNivel,
  obtenerReferenciaQuiz,
} from "../application/referencia-curricular";

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");

const crearSchema = z.object({
  nombre: z.string().min(3).max(80),
  inicio: FECHA, // inicio de campaña
  cursoInicio: FECHA, // inicio del curso
  fin: FECHA.optional(), // editable; por defecto inicio + 12 meses
});

const actualizarSchema = z.object({
  fin: FECHA.optional(),
  finalVenta: FECHA.optional(),
});

/** POST /api/catalog/campaigns — crea la campaña con toda su estructura. */
export const crearCampaniaHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);

  const body = crearSchema.parse(await request.json());
  const campania = await crearCampania({
    actorUserId: auth.userId,
    ...body,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ campania }, { status: 201 });
});

/** GET /api/catalog/campaigns — lista con estado derivado por fecha. */
export const listarCampaniasHandler = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  return json({ campanias: await listarCampanias() });
});

/** GET /api/catalog/campaigns/[id] — árbol completo de la campaña. */
export const detalleCampaniaHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const params = await context.params;
  const id = z.uuid().parse(params["id"]);
  return json({ campania: await detalleCampania(id) });
});

/** PATCH /api/catalog/campaigns/[id] — edita fin (vigencia) y/o cierre de matrícula. */
export const actualizarCampaniaHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const params = await context.params;
  const id = z.uuid().parse(params["id"]);
  const body = actualizarSchema.parse(await request.json());
  await actualizarFechasCampania({
    actorUserId: auth.userId,
    campaignId: id,
    ...body,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true });
});

// ============================================================
// Referencia curricular (material/video/actividades/evaluación)
// ============================================================

function ipDe(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function idParam(context: { params: Promise<Record<string, string | string[]>> }): Promise<string> {
  return z.uuid().parse((await context.params)["id"]);
}

const materialItem = z.object({
  nombre: z.string().min(1).max(200),
  url: z.string().min(1).max(1000),
});
const actividadItem = z.object({
  nombre: z.string().min(1).max(200),
  link: z.string().min(1).max(1000),
});
const preguntaItem = z.object({
  id: z.string().max(60).optional(),
  tipo: z.enum(["opcion_multiple", "verdadero_falso"]).default("opcion_multiple"),
  enunciado: z.string().min(1).max(1000),
  opciones: z.array(z.string().max(500)).min(2).max(6),
  correcta: z.number().int().min(0).max(5),
  explicacion: z.string().max(1000).optional(),
});

const refLeccionSchema = z.object({
  contenido: z.string().max(20000).nullable().optional(),
  videoUrl: z.string().max(1000).nullable().optional(),
  material: z.array(materialItem).max(50).optional(),
  materialUsuario: z.array(materialItem).max(50).optional(),
  actividades: z.array(actividadItem).max(50).optional(),
});
const refNivelSchema = z.object({
  descripcion: z.string().max(5000).nullable().optional(),
  recursos: z.array(actividadItem).max(50).optional(),
});
const refQuizSchema = z.object({
  modo: z.enum(["IA", "MANUAL"]).optional(),
  minutos: z.number().int().min(1).max(180).nullable().optional(),
  preguntas: z.array(preguntaItem).max(100).optional(),
});

/** GET /api/catalog/lessons/[id]/referencia */
export const referenciaLeccionGetHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  return json({ referencia: await obtenerReferenciaLeccion(await idParam(context)) });
});

/** PUT /api/catalog/lessons/[id]/referencia — merge (solo campos provistos). */
export const referenciaLeccionPutHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const id = await idParam(context);
  const body = refLeccionSchema.parse(await request.json());
  await actualizarReferenciaLeccion({ actorUserId: auth.userId, lessonId: id, ...body, ip: ipDe(request) });
  return json({ ok: true });
});

/** GET /api/catalog/levels/[id]/referencia */
export const referenciaNivelGetHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  return json({ referencia: await obtenerReferenciaNivel(await idParam(context)) });
});

/** PUT /api/catalog/levels/[id]/referencia */
export const referenciaNivelPutHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const id = await idParam(context);
  const body = refNivelSchema.parse(await request.json());
  await actualizarReferenciaNivel({ actorUserId: auth.userId, levelId: id, ...body, ip: ipDe(request) });
  return json({ ok: true });
});

/** GET /api/catalog/quizzes/[id]/referencia */
export const referenciaQuizGetHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  return json({ referencia: await obtenerReferenciaQuiz(await idParam(context)) });
});

/** PUT /api/catalog/quizzes/[id]/referencia */
export const referenciaQuizPutHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const id = await idParam(context);
  const body = refQuizSchema.parse(await request.json());
  await actualizarReferenciaQuiz({ actorUserId: auth.userId, quizId: id, ...body, ip: ipDe(request) });
  return json({ ok: true });
});
