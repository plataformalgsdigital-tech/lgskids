import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { verificarAccesoGuia } from "@/modules/attendance";
import { bootstrapIdentity } from "@/modules/identity";
import {
  cerrarSesion,
  reabrirSesion,
  repeticionesDeSesion,
  solicitarRepeticion,
} from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Registro de la sesión: cerrarla y pedir repetirla.
 *
 * Quién puede qué:
 *  - CERRAR y SOLICITAR: el guía del salón (o coordinación). Se acota con
 *    `verificarAccesoGuia`, el mismo guardia que ya usa la asistencia — así un
 *    guía no cierra sesiones de salones ajenos.
 *  - REABRIR: solo coordinación (`salones.gestionar`).
 */

async function sessionIdDe(context: unknown): Promise<string> {
  const ctx = context as { params: Promise<{ sessionId?: string }> };
  const p = await ctx.params;
  if (typeof p.sessionId !== "string") throw new ValidationError("Falta la sesión.");
  return p.sessionId;
}

function ipDe(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** GET — estado del registro y solicitudes de repetición de la sesión. */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const sessionId = await sessionIdDe(context);
  return json({ repeticiones: await repeticionesDeSesion(sessionId) });
});

const cuerpoSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("cerrar"),
    /** Hora de pared a la que se dictó, en la zona del salón. */
    horaReal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
    nota: z.string().max(1000).nullish(),
    /** Confirmación explícita cuando no hay ninguna asistencia marcada. */
    sinAsistentes: z.boolean().default(false),
  }),
  z.object({ accion: z.literal("reabrir") }),
  z.object({
    accion: z.literal("solicitar_repeticion"),
    motivo: z.string().min(5).max(500),
    repetirLeccion: z.boolean().default(false),
  }),
]);

/** POST — cerrar, reabrir o solicitar repetición. */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
  const sessionId = await sessionIdDe(context);
  const puedeGestionar = profile.hasPermission(PERMISOS.SALONES_GESTIONAR);
  await verificarAccesoGuia(sessionId, {
    userId: auth.userId,
    puedeGestionarCualquierSalon: puedeGestionar,
  });

  const body = cuerpoSchema.parse(await request.json());
  const ip = ipDe(request);

  if (body.accion === "cerrar") {
    return json(
      await cerrarSesion({
        actorUserId: auth.userId,
        sessionId,
        horaReal: body.horaReal,
        nota: body.nota ?? null,
        sinAsistentes: body.sinAsistentes,
        ip,
      }),
    );
  }
  if (body.accion === "reabrir") {
    // Deshacer un cierre es corrección administrativa, no tarea del guía.
    profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
    return json(await reabrirSesion({ actorUserId: auth.userId, sessionId, ip }));
  }
  return json(
    await solicitarRepeticion({
      actorUserId: auth.userId,
      sessionId,
      motivo: body.motivo,
      repetirLeccion: body.repetirLeccion,
      ip,
    }),
    { status: 201 },
  );
});
