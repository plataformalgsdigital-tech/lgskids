import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { editarEvento } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const editarSchema = z.object({
  tipo: z.enum(["SESION", "CLUB", "TALLER"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe ser YYYY-MM-DD."),
  // Hora de PARED en la zona del salón, como al crearlo.
  horaLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
  duracionMin: z.number().int().min(15).max(300),
  nivel: z.string().max(40).nullish(),
  limiteUsuarios: z.number().int().min(1).max(200).nullish(),
  guiaUserId: z.uuid(),
  observaciones: z.string().max(1000).nullish(),
});

/**
 * PATCH — EDITA un evento creado a mano en el calendario (sesión extra, club,
 * taller, refuerzo), aunque el salón tenga niños: la lista sale de sus
 * matrículas. Si es compartido, se edita en todos sus salones. `eventos.crear`.
 */
export const PATCH = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  profile.requireOpcion("op.calendario.evento_academico");
  const sessionId = z.uuid().parse((await context.params)["sessionId"]);
  const body = editarSchema.parse(await request.json());
  return json(
    await editarEvento({
      actorUserId: auth.userId,
      sessionId,
      tipo: body.tipo,
      fecha: body.fecha,
      horaLocal: body.horaLocal,
      duracionMin: body.duracionMin,
      nivel: body.nivel ?? null,
      limiteUsuarios: body.limiteUsuarios ?? null,
      guiaUserId: body.guiaUserId,
      observaciones: body.observaciones ?? null,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
