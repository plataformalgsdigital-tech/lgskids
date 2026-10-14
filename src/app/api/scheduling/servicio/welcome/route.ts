import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { agendadosWelcome } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD.");

/**
 * GET — Servicio › Welcome: niños agendados en Welcome de un rango de días (en
 * el reloj de quien consulta, `zona`), con si asistieron. Exige ver salones Y
 * personas; alcance por país del niño.
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
      zona: z.string().min(1).max(64),
      buscar: z.string().max(100).optional(),
      campaignId: z.uuid().optional(),
      curso: z.enum(["JUNIOR", "YOUNGSTER"]).optional(),
      classroomId: z.uuid().optional(),
      asistencia: z.enum(["SI", "NO", "SIN_MARCAR"]).optional(),
    })
    .parse({
      desde: p.get("desde"),
      hasta: p.get("hasta"),
      zona: p.get("zona"),
      buscar: p.get("buscar") || undefined,
      campaignId: p.get("campaignId") || undefined,
      curso: p.get("curso") || undefined,
      classroomId: p.get("classroomId") || undefined,
      asistencia: p.get("asistencia") || undefined,
    });
  return json({
    agendados: await agendadosWelcome({
      countryScope: auth.countryScope,
      desde: q.desde,
      hasta: q.hasta,
      zona: q.zona,
      buscar: q.buscar ?? null,
      campaignId: q.campaignId ?? null,
      curso: q.curso ?? null,
      classroomId: q.classroomId ?? null,
      asistencia: q.asistencia ?? null,
    }),
  });
});
