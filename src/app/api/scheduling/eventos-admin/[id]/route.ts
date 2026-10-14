import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  CODIGOS_EVENTO_ADMIN,
  DURACION_ADMIN_MAX,
  DURACION_ADMIN_MIN,
  detalleEventoAdmin,
  editarEventoAdmin,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** GET — el evento administrativo completo, para editarlo (`eventos.crear`). */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const id = z.uuid().parse((await context.params)["id"]);
  return json({ evento: await detalleEventoAdmin(id) });
});

const editarSchema = z.object({
  tipo: z.enum(CODIGOS_EVENTO_ADMIN),
  titulo: z.string().max(200).nullish(),
  fecha: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Fecha YYYY-MM-DD."),
  horaLocal: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "La hora debe ser HH:MM."),
  duracionMin: z.number().int().min(DURACION_ADMIN_MIN).max(DURACION_ADMIN_MAX),
  pais: z.enum(["CL", "CO", "EC", "PE"]).nullish(),
  // Zona IANA del navegador de quien edita: el evento es un instante.
  zona: z.string().min(1).max(64),
  campania: z.string().max(120).nullish(),
  curso: z.string().max(40).nullish(),
  classroomId: z.uuid().nullish(),
  nivel: z.string().max(40).nullish(),
  limiteUsuarios: z.number().int().min(1).max(500).nullish(),
  observaciones: z.string().max(1000).nullish(),
  guiaUserIds: z.array(z.uuid()).min(1),
});

/**
 * PATCH — EDITA el evento administrativo, aunque ya tenga guías convocados: la
 * audiencia nueva reemplaza a la anterior (quien sigue conserva su asistencia).
 */
export const PATCH = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  const id = z.uuid().parse((await context.params)["id"]);
  const body = editarSchema.parse(await request.json());
  return json(
    await editarEventoAdmin({
      actorUserId: auth.userId,
      id,
      tipo: body.tipo,
      titulo: body.titulo ?? null,
      fecha: body.fecha,
      horaLocal: body.horaLocal,
      duracionMin: body.duracionMin,
      pais: body.pais ?? null,
      zona: body.zona,
      campania: body.campania ?? null,
      curso: body.curso ?? null,
      classroomId: body.classroomId ?? null,
      nivel: body.nivel ?? null,
      limiteUsuarios: body.limiteUsuarios ?? null,
      observaciones: body.observaciones ?? null,
      guiaUserIds: body.guiaUserIds,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
