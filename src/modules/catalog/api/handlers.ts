import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { DURACION_MAX_SEMANAS, DURACION_MIN_SEMANAS } from "../domain/campania";
import { crearCampania } from "../application/crear-campania";
import { detalleCampania, listarCampanias } from "../application/consultas";

const crearSchema = z.object({
  nombre: z.string().min(3).max(80),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  duracionSemanas: z.coerce.number().int().min(DURACION_MIN_SEMANAS).max(DURACION_MAX_SEMANAS),
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
