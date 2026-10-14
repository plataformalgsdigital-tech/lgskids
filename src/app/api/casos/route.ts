import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { ORIGENES, TEMAS, VISTAS, bandejaCasos } from "@/modules/casos";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD.");

/**
 * GET — Servicio › Casos de atención: una bandeja (sin asignar, cada área o el
 * histórico) con los conteos de todas. `casos.ver`, alcance por país del niño.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CASOS_VER);
  const p = new URL(request.url).searchParams;
  const q = z
    .object({
      vista: z.enum(VISTAS).default("SIN_ASIGNAR"),
      zona: z.string().min(1).max(64),
      desde: fecha.optional(),
      hasta: fecha.optional(),
      buscar: z.string().max(100).optional(),
      campaignId: z.uuid().optional(),
      curso: z.enum(["JUNIOR", "YOUNGSTER"]).optional(),
      classroomId: z.uuid().optional(),
      tema: z.enum(TEMAS).optional(),
      origen: z.enum(ORIGENES).optional(),
    })
    .parse(Object.fromEntries([...p.entries()].filter(([, v]) => v !== "")));
  const r = await bandejaCasos({
    countryScope: auth.countryScope,
    vista: q.vista,
    zona: q.zona,
    desde: q.desde ?? null,
    hasta: q.hasta ?? null,
    buscar: q.buscar ?? null,
    campaignId: q.campaignId ?? null,
    curso: q.curso ?? null,
    classroomId: q.classroomId ?? null,
    tema: q.tema ?? null,
    origen: q.origen ?? null,
  });
  return json({ ...r, puedeGestionar: profile.hasPermission(PERMISOS.CASOS_GESTIONAR) });
});
