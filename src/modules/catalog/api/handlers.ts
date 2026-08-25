import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { crearCampania } from "../application/crear-campania";
import { actualizarFechasCampania } from "../application/editar-campania";
import { detalleCampania, listarCampanias } from "../application/consultas";

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
