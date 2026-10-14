import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { MAX_INASISTENCIAS, inasistencias } from "@/modules/attendance";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD.");

/**
 * GET — Servicio › Asistencia: niños que no asistieron entre `desde` y `hasta`
 * (fecha local del salón). Exige ver personas Y asistencia: el guía tiene
 * `asistencia.ver` pero no `personas.ver`, así que no ve los niños de otros
 * salones por aquí. Alcance por país.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  profile.requirePermission(PERMISOS.ASISTENCIA_VER);
  const p = new URL(request.url).searchParams;
  const q = z
    .object({
      desde: fecha,
      hasta: fecha,
      buscar: z.string().max(100).optional(),
      campaignId: z.uuid().optional(),
      curso: z.enum(["JUNIOR", "YOUNGSTER"]).optional(),
      classroomId: z.uuid().optional(),
      estado: z.enum(["AUSENTE", "JUSTIFICADO"]).optional(),
    })
    .parse({
      desde: p.get("desde"),
      hasta: p.get("hasta"),
      buscar: p.get("buscar") || undefined,
      campaignId: p.get("campaignId") || undefined,
      curso: p.get("curso") || undefined,
      classroomId: p.get("classroomId") || undefined,
      estado: p.get("estado") || undefined,
    });
  const filas = await inasistencias({
    countryScope: auth.countryScope,
    desde: q.desde,
    hasta: q.hasta,
    buscar: q.buscar ?? null,
    campaignId: q.campaignId ?? null,
    curso: q.curso ?? null,
    classroomId: q.classroomId ?? null,
    estado: q.estado ?? null,
  });
  return json({ inasistencias: filas, tope: MAX_INASISTENCIAS });
});
