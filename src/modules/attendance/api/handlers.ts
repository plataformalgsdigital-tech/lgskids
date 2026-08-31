import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { listaDeSesion, marcarAsistencia, verificarAccesoGuia } from "../application/asistencia";

async function sessionIdFromContext(context: {
  params: Promise<Record<string, string | string[]>>;
}): Promise<string> {
  const params = await context.params;
  return z.uuid().parse(params["id"]);
}

/** GET /api/attendance/sessions/[id] — lista con marcas y aviso de feriado. */
export const listaDeSesionHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ASISTENCIA_VER);
  const sessionId = await sessionIdFromContext(context);
  await verificarAccesoGuia(sessionId, {
    userId: auth.userId,
    puedeGestionarCualquierSalon: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
  });
  return json(await listaDeSesion(sessionId));
});

const marcarSchema = z.object({
  marcas: z
    .array(
      z.object({
        childPersonId: z.uuid(),
        estado: z.enum(["PRESENTE", "AUSENTE", "JUSTIFICADO"]),
        justificacion: z.string().max(300).nullish(),
        // Ficha del alumno. Omitida = no se toca (la marca masiva no borra
        // los comentarios que el guía ya escribió).
        participo: z.boolean().optional(),
        comentarioUsuario: z.string().max(2000).nullish(),
        notaPrivada: z.string().max(2000).nullish(),
        requiereAtencion: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(100),
});

/** POST /api/attendance/sessions/[id] — marca individual o masiva (mismo camino). */
export const marcarAsistenciaHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
  const sessionId = await sessionIdFromContext(context);
  await verificarAccesoGuia(sessionId, {
    userId: auth.userId,
    puedeGestionarCualquierSalon: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
  });
  const body = marcarSchema.parse(await request.json());
  const resultado = await marcarAsistencia({
    actorUserId: auth.userId,
    sessionId,
    marcas: body.marcas.map((m) => ({
      childPersonId: m.childPersonId,
      estado: m.estado,
      justificacion: m.justificacion ?? null,
      participo: m.participo,
      comentarioUsuario: m.comentarioUsuario ?? undefined,
      notaPrivada: m.notaPrivada ?? undefined,
      requiereAtencion: m.requiereAtencion,
    })),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(resultado);
});
