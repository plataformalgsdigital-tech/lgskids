import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { previoFeriadosEvento, salonesDelAlcance } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const previoSchema = z.object({
  classroomIds: z.array(z.uuid()).max(50).default([]),
  todos: z
    .object({
      campaignId: z.uuid().nullable(),
      pais: z.enum(["CL", "CO", "EC", "PE"]).nullable(),
      curso: z.enum(["JUNIOR", "YOUNGSTER"]).nullable(),
    })
    .optional(),
  zona: z.string().min(1).max(64).optional(),
  tipo: z.enum(["SESION", "CLUB", "TALLER"]),
  fecha: z.string(),
  horaLocal: z.string(),
  tanda: z.object({ inicio: z.string(), fin: z.string() }).nullish(),
});

/**
 * POST — PREVIO de feriados antes de crear un evento académico: con el mismo
 * cuerpo que el alta, dice si la fecha es feriado, cuál será la primera sesión y
 * qué semanas de la tanda se saltan. No escribe nada.
 */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const body = previoSchema.parse(await request.json());
  return json(
    await previoFeriadosEvento({
      classroomIds:
        body.todos !== undefined ? await salonesDelAlcance(body.todos) : body.classroomIds,
      tipo: body.tipo,
      clubUnico: body.tipo === "CLUB" && body.todos !== undefined,
      fecha: body.fecha,
      horaLocal: body.horaLocal,
      ...(body.zona !== undefined && { zona: body.zona }),
      tanda: body.tanda ?? null,
    }),
  );
});
