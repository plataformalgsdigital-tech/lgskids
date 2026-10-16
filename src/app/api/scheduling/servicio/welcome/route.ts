import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  MAX_INTENTOS_WELCOME,
  MAX_VIDEOS_POR_TANDA,
  agendadosWelcome,
  candidatosVideoWelcome,
  pendientesWelcome,
  reagendamientosWelcome,
  videoWelcome,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD.");

/**
 * GET — Servicio › Welcome, como en MOSAICO: `vista` = eventos | reagendamientos
 * | pendientes | video. Exige ver salones Y personas (el guía tiene lo primero y
 * no lo segundo). Alcance por país del niño. Devuelve además qué puede hacer
 * quien mira, para que la pantalla no ofrezca lo que el servidor rechazaría.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const p = new URL(request.url).searchParams;
  const q = z
    .object({
      vista: z.enum(["eventos", "reagendamientos", "pendientes", "video"]).default("eventos"),
      zona: z.string().min(1).max(64).default("UTC"),
      desde: fecha.optional(),
      hasta: fecha.optional(),
      buscar: z.string().max(100).optional(),
      campaignId: z.uuid().optional(),
      curso: z.enum(["JUNIOR", "YOUNGSTER"]).optional(),
      classroomId: z.uuid().optional(),
      estado: z.enum(["ASISTIO", "ASISTIO_OTRA", "VIDEO", "PENDIENTE", "NO_ASISTIO"]).optional(),
      motivo: z.enum(["SOLO_PERFIL", "SIN_PERFIL", "SIN_REGISTRO"]).optional(),
      soloSinReagendar: z.enum(["1", "0"]).optional(),
    })
    .parse(Object.fromEntries([...p.entries()].filter(([, v]) => v !== "")));
  const base = {
    countryScope: auth.countryScope,
    buscar: q.buscar ?? null,
    campaignId: q.campaignId ?? null,
    curso: q.curso ?? null,
    classroomId: q.classroomId ?? null,
  };
  const puede = {
    puedeReagendar: profile.hasPermission("op.kids.agendar_welcome"),
    puedeEnviar: profile.hasPermission("op.servicio.video_enviar"),
    puedeConfigurarVideo: profile.hasPermission("op.servicio.video_config"),
    maxIntentos: MAX_INTENTOS_WELCOME,
    maxPorTanda: MAX_VIDEOS_POR_TANDA,
  };
  const fechas = { desde: q.desde ?? null, hasta: q.hasta ?? null, zona: q.zona };
  switch (q.vista) {
    case "eventos":
      return json({
        ...puede,
        agendados: await agendadosWelcome({ ...base, ...fechas, estado: q.estado ?? null }),
      });
    case "reagendamientos":
      return json({
        ...puede,
        inasistentes: await reagendamientosWelcome({
          ...base,
          ...fechas,
          soloSinReagendar: q.soloSinReagendar === "1",
        }),
      });
    case "pendientes":
      return json({
        ...puede,
        pendientes: await pendientesWelcome({ ...base, motivo: q.motivo ?? null }),
      });
    case "video":
      return json({
        ...puede,
        video: await videoWelcome(),
        candidatos: await candidatosVideoWelcome(base),
      });
  }
});
