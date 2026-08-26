import { z } from "zod";
import { NextResponse } from "next/server";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { ValidationError } from "@/platform/errors";
import {
  descargarImagenCurso,
  imagenCursoId,
  subirImagenCurso,
} from "../application/imagen-curso";
import { crearCampania } from "../application/crear-campania";
import { actualizarFechasCampania } from "../application/editar-campania";
import { detalleCampania, listarCampanias } from "../application/consultas";
import {
  actualizarReferenciaNivel,
  actualizarReferenciaQuiz,
  obtenerReferenciaNivel,
  obtenerReferenciaQuiz,
} from "../application/referencia-curricular";
import {
  actualizarCursoReferencia,
  crearCursoReferencia,
  eliminarCursoReferencia,
  importarCursoReferencia,
  listarCursoReferencia,
  obtenerCursoReferencia,
} from "../application/curso-referencia";

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

// Tabla maestra catalog_curso
const cursoBaseSchema = {
  curso: z.enum(["JUNIOR", "YOUNGSTER"]),
  nivel: z.enum(["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"]),
  unidad: z.string().max(120).nullish(),
  // Contenido del quiz (JSON libre): el editor de Referencia guarda un arreglo de
  // preguntas; Gestión de Contenido guarda { cuestionarios: [...] }. La forma la
  // definen los editores; aquí solo se persiste como JSONB.
  quiz: z.unknown().nullish(),
  leccion: z.string().min(1).max(200),
  orden: z.number().int().min(0).max(999).optional(),
  contenido: z.string().max(20000).nullish(),
  video: z.string().max(1000).nullish(),
  clubes: z.array(actividadItem).max(50).optional(),
  materialUsuario: z.array(materialItem).max(50).optional(),
  materialGuia: z.array(materialItem).max(50).optional(),
  actividades: z.array(actividadItem).max(50).optional(),
  recursos: z.array(actividadItem).max(50).optional(),
};
const cursoCrearSchema = z.object(cursoBaseSchema);

const refNivelSchema = z.object({
  descripcion: z.string().max(5000).nullable().optional(),
  recursos: z.array(actividadItem).max(50).optional(),
});
const refQuizSchema = z.object({
  modo: z.enum(["IA", "MANUAL"]).optional(),
  minutos: z.number().int().min(1).max(180).nullable().optional(),
  preguntas: z.array(preguntaItem).max(100).optional(),
});

/** GET /api/catalog/curso?curso=&nivel= — lista la referencia maestra de cursos. */
export const cursoReferenciaListHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const q = request.nextUrl.searchParams;
  const curso = q.get("curso");
  const nivel = q.get("nivel");
  return json({
    referencias: await listarCursoReferencia({
      ...(curso !== null && curso !== "" && { curso }),
      ...(nivel !== null && nivel !== "" && { nivel }),
    }),
  });
});

/** POST /api/catalog/curso — crea una fila de referencia (curso·nivel·módulo·lección). */
export const cursoReferenciaCrearHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const body = cursoCrearSchema.parse(await request.json());
  const r = await crearCursoReferencia({ actorUserId: auth.userId, ...body, ip: ipDe(request) });
  return json(r, { status: 201 });
});

const cursoBulkSchema = z.object({
  filas: z.array(z.object(cursoBaseSchema)).min(1).max(1000),
});

/** POST /api/catalog/curso/bulk — importa (upsert) muchas filas desde CSV. */
export const cursoReferenciaBulkHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const body = cursoBulkSchema.parse(await request.json());
  const r = await importarCursoReferencia({
    actorUserId: auth.userId,
    filas: body.filas,
    ip: ipDe(request),
  });
  return json(r);
});

/** GET /api/catalog/curso/[id] */
export const cursoReferenciaGetHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  return json({ referencia: await obtenerCursoReferencia(await idParam(context)) });
});

/** PUT /api/catalog/curso/[id] */
export const cursoReferenciaPutHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const id = await idParam(context);
  const body = cursoCrearSchema.parse(await request.json());
  await actualizarCursoReferencia({ actorUserId: auth.userId, id, ...body, ip: ipDe(request) });
  return json({ ok: true });
});

/** DELETE /api/catalog/curso/[id] */
export const cursoReferenciaDeleteHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const id = await idParam(context);
  await eliminarCursoReferencia({ actorUserId: auth.userId, id, ip: ipDe(request) });
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

// ============================================================
// Imagen de curso (banner por curso · nivel)
// ============================================================

/** POST /api/catalog/imagen-curso — multipart (curso, nivel, archivo). */
export const imagenCursoSubirHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const curso = form?.get("curso");
  const nivel = form?.get("nivel");
  if (form === null || !(archivo instanceof File) || typeof curso !== "string" || typeof nivel !== "string") {
    throw new ValidationError("Envía multipart/form-data con 'curso', 'nivel' y 'archivo'.");
  }
  const r = await subirImagenCurso({
    actorUserId: auth.userId,
    curso,
    nivel,
    nombreOriginal: archivo.name,
    mime: archivo.type,
    bytes: Buffer.from(await archivo.arrayBuffer()),
  });
  return json(r, { status: 201 });
});

/** GET /api/catalog/imagen-curso?curso=&nivel= — id de la imagen vigente (o null). */
export const imagenCursoInfoHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const q = request.nextUrl.searchParams;
  const id = await imagenCursoId(q.get("curso") ?? "", q.get("nivel") ?? "");
  return json({ id, url: id !== null ? `/api/catalog/imagen-curso/${id}` : null });
});

/** GET /api/catalog/imagen-curso/[id] — sirve la imagen (autenticado; arte curricular). */
export const imagenCursoServeHandler = handlerWithAuth(async (_request, _auth, context) => {
  const id = await idParam(context);
  const { meta, bytes } = await descargarImagenCurso(id);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
});
