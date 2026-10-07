import { after } from "next/server";
import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import {
  MAX_DESTINATARIOS,
  actualizarPlantilla,
  buscarDestinatarios,
  crearPlantilla,
  encolarEnvio,
  enviarCredenciales,
  historialEnvios,
  listarPlantillas,
  vistaCredenciales,
} from "../application/mensajes";
import { procesarOutbox } from "../application/outbox";
import { DESCRIPCION_MARCADOR, MARCADORES } from "../domain/plantilla";
import { proveedorActivo } from "../infrastructure/senders";

function ip(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function idDe(
  context: { params: Promise<Record<string, string | string[]>> },
  clave: string,
): Promise<string> {
  return z.uuid().parse((await context.params)[clave]);
}

/** GET /api/notifications/plantillas — también para quien solo envía (elige plantilla). */
export const plantillasListarHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  if (!profile.hasPermission(PERMISOS.MENSAJES_PLANTILLAS)) {
    profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  }
  const incluirInactivas = request.nextUrl.searchParams.get("inactivas") === "1";
  return json({
    plantillas: await listarPlantillas(incluirInactivas),
    marcadores: MARCADORES.map((m) => ({ clave: m, descripcion: DESCRIPCION_MARCADOR[m] })),
    proveedor: proveedorActivo(),
    puedeEditar: profile.hasPermission(PERMISOS.MENSAJES_PLANTILLAS),
  });
});

const crearSchema = z.object({
  slug: z.string().min(1).max(60),
  nombre: z.string().min(1).max(120),
  descripcion: z.string().max(500).nullish(),
  contenido: z.string().min(1).max(1000),
});

/** POST /api/notifications/plantillas */
export const plantillaCrearHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_PLANTILLAS);
  const body = crearSchema.parse(await request.json());
  const plantilla = await crearPlantilla({ actorUserId: auth.userId, ...body, ip: ip(request) });
  return json({ plantilla }, { status: 201 });
});

const actualizarSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  descripcion: z.string().max(500).nullish(),
  contenido: z.string().min(1).max(1000).optional(),
  activo: z.boolean().optional(),
});

/** PATCH /api/notifications/plantillas/[id] — el slug no se edita. */
export const plantillaActualizarHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_PLANTILLAS);
  const id = await idDe(context, "id");
  const body = actualizarSchema.parse(await request.json());
  const plantilla = await actualizarPlantilla({
    actorUserId: auth.userId,
    id,
    nombre: body.nombre,
    ...(body.descripcion !== undefined && { descripcion: body.descripcion }),
    contenido: body.contenido,
    activo: body.activo,
    ip: ip(request),
  });
  return json({ plantilla });
});

const destinatariosSchema = z.object({
  classroomId: z.uuid().optional(),
  documentos: z.array(z.string().max(40)).max(MAX_DESTINATARIOS).optional(),
  plantillaId: z.uuid().optional(),
});

/** POST /api/notifications/destinatarios — por salón o por documentos. */
export const destinatariosHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  const body = destinatariosSchema.parse(await request.json());
  return json(await buscarDestinatarios({ countryScope: auth.countryScope, ...body }));
});

const envioSchema = z.object({
  plantillaId: z.uuid(),
  childPersonIds: z.array(z.uuid()).min(1).max(MAX_DESTINATARIOS),
});

/**
 * POST /api/notifications/envios — encola y responde; el despacho corre
 * DESPUÉS de responder (300 envíos de a uno no caben en una petición). Lo que
 * falle lo reintenta el worker.
 */
export const envioHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  const body = envioSchema.parse(await request.json());
  const r = await encolarEnvio({
    actorUserId: auth.userId,
    countryScope: auth.countryScope,
    ...body,
    ip: ip(request),
  });
  if (r.ids.length > 0) {
    after(() => procesarOutbox(r.ids.length, r.ids));
  }
  return json({ encolados: r.encolados, omitidos: r.omitidos }, { status: 202 });
});

const historialSchema = z.object({
  estado: z.enum(["PENDIENTE", "ENVIADA", "FALLIDA"]).optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** GET /api/notifications/envios — historial (el outbox). */
export const historialHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  const q = historialSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return json({
    envios: await historialEnvios({ countryScope: auth.countryScope, ...q }),
    proveedor: proveedorActivo(),
  });
});

/** GET /api/notifications/credenciales/[childPersonId] — a quién y qué, antes de confirmar. */
export const credencialesVistaHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  const childPersonId = await idDe(context, "childPersonId");
  return json({
    ...(await vistaCredenciales(childPersonId, auth.countryScope)),
    proveedor: proveedorActivo(),
  });
});

/** POST /api/notifications/credenciales/[childPersonId] — envía usuario y clave AHORA. */
export const credencialesEnviarHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MENSAJES_ENVIAR);
  const childPersonId = await idDe(context, "childPersonId");
  const r = await enviarCredenciales({
    actorUserId: auth.userId,
    childPersonId,
    countryScope: auth.countryScope,
    ip: ip(request),
  });
  return json(r, { status: r.ok ? 200 : 502 });
});
