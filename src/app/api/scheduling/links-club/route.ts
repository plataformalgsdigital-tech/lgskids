import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { DIAS_SEMANA, crearLinkClub, listarLinksClub } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Links de Clubes (Sesiones › Links de Clubes): salas propias de los Clubs,
 * por día de la semana. Las administra quien crea eventos (`eventos.crear` +
 * `op.sesiones.links_clubes`).
 */

/** GET — todos los links (activos e inactivos) y los nombres de los días. */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  return json({ links: await listarLinksClub(), dias: DIAS_SEMANA });
});

const crearSchema = z.object({
  nombre: z.string().max(120),
  diaSemana: z.number().int().min(0).max(6),
  horario: z.string().max(60),
  link: z.string().max(500),
});

/** POST — crea un link. */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.EVENTOS_CREAR);
  profile.requireOpcion("op.sesiones.links_clubes");
  const body = crearSchema.parse(await request.json());
  return json(
    await crearLinkClub({
      ...body,
      actorUserId: auth.userId,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
    { status: 201 },
  );
});
