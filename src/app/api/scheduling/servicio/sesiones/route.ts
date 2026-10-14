import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { sesionesServicio } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD.");

/**
 * GET — Servicio › Sesiones: qué pasó con las sesiones de un rango de días
 * (realizada, no realizada, cancelada por el guía, suspendida). Exige ver
 * salones Y personas: el guía tiene lo primero pero no lo segundo, así que no
 * ve el calendario de toda la plataforma por aquí. Alcance por país del salón.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const p = new URL(request.url).searchParams;
  const q = z
    .object({
      desde: fecha,
      hasta: fecha,
      campaignId: z.uuid().optional(),
      curso: z.enum(["JUNIOR", "YOUNGSTER"]).optional(),
      classroomId: z.uuid().optional(),
      estado: z
        .enum(["REALIZADA", "NO_REALIZADA", "CANCELADA", "SUSPENDIDA", "PROGRAMADA"])
        .optional(),
    })
    .parse({
      desde: p.get("desde"),
      hasta: p.get("hasta"),
      campaignId: p.get("campaignId") || undefined,
      curso: p.get("curso") || undefined,
      classroomId: p.get("classroomId") || undefined,
      estado: p.get("estado") || undefined,
    });
  return json({
    sesiones: await sesionesServicio({
      countryScope: auth.countryScope,
      desde: q.desde,
      hasta: q.hasta,
      campaignId: q.campaignId ?? null,
      curso: q.curso ?? null,
      classroomId: q.classroomId ?? null,
      estado: q.estado ?? null,
    }),
  });
});
