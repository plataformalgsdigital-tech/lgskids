import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { resolverRepeticion } from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Autorizar (o no) un refuerzo.
 *
 * Autorizar CREA la clase extra, así que hay que decir cuándo se dicta: el
 * horario regular del salón ya está ocupado y dos sesiones no pueden compartir
 * instante. No se toca el curso ni su fecha de fin.
 */

const cuerpo = z.object({
  aprobar: z.boolean(),
  nota: z.string().max(500).nullish(),
  refuerzo: z
    .object({
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe ser YYYY-MM-DD."),
      horaLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
      duracionMin: z.number().int().min(15).max(300),
      guiaUserId: z.uuid().nullish(),
    })
    .nullish(),
});

export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);

  const { id } = (await context.params) as { id?: string };
  if (typeof id !== "string" || id === "") {
    throw new ValidationError("Falta el identificador de la solicitud.");
  }

  const b = cuerpo.parse(await request.json());
  const r = await resolverRepeticion({
    actorUserId: auth.userId,
    repeticionId: id,
    aprobar: b.aprobar,
    nota: b.nota ?? null,
    refuerzo:
      b.refuerzo == null
        ? null
        : {
            fecha: b.refuerzo.fecha,
            horaLocal: b.refuerzo.horaLocal,
            duracionMin: b.refuerzo.duracionMin,
            guiaUserId: b.refuerzo.guiaUserId ?? null,
          },
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(r);
});
