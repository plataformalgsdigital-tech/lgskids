import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { avisarCancelacion, cancelacionDeSesion, cancelarPorGuia } from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Cancelación de la sesión por el guía.
 *  - GET: el aviso de la sesión (si hay) y qué puede hacer quien mira.
 *  - POST { motivo }: el guía AVISA (`asistencia.gestionar`; solo sus sesiones,
 *    lo comprueba `avisarCancelacion`).
 *  - POST { motivo, directa: true, reemplazoGuiaUserId? }: administración
 *    (`salones.gestionar`) la CANCELA de una vez, con o sin reemplazo.
 * Resolver un aviso pendiente es `POST /api/scheduling/cancelaciones/[id]`.
 */

async function sessionIdDe(context: unknown): Promise<string> {
  const p = await (context as { params: Promise<{ sessionId?: string }> }).params;
  if (typeof p.sessionId !== "string") throw new ValidationError("Falta la sesión.");
  return z.uuid().parse(p.sessionId);
}

export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const sessionId = await sessionIdDe(context);
  return json({
    cancelacion: await cancelacionDeSesion(sessionId),
    puedeAvisar: profile.hasPermission(PERMISOS.ASISTENCIA_GESTIONAR),
    puedeResolver: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
  });
});

const cuerpo = z.object({
  motivo: z.string().min(5).max(500),
  directa: z.boolean().default(false),
  reemplazoGuiaUserId: z.uuid().nullish(),
});

export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
  const sessionId = await sessionIdDe(context);
  const body = cuerpo.parse(await request.json());
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (body.directa) {
    // Cancelar es decisión de administración, no del guía.
    profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
    return json(
      await cancelarPorGuia({
        actorUserId: auth.userId,
        sessionId,
        motivo: body.motivo,
        reemplazoGuiaUserId: body.reemplazoGuiaUserId ?? null,
        ip,
      }),
      { status: 201 },
    );
  }
  return json(
    await avisarCancelacion({
      actorUserId: auth.userId,
      sessionId,
      motivo: body.motivo,
      puedeGestionar: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
      ip,
    }),
    { status: 201 },
  );
});
