import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { guardarJuegosUnidad, juegosDeUnidad } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Enlaces de JUEGOS por unidad (curso · nivel · unidad 1..4).
 *
 * Es lo que el niño abre al tocar "Unidad N" en el mapa de la isla, junto con
 * la lámina de esa unidad. Ver = `catalogo.ver`; editar = `catalogo.gestionar`.
 */

const juegoSchema = z.object({
  nombre: z.string().max(120),
  enlace: z.string().max(500),
  // Posición sobre la lámina, en % (opcional).
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
});

const guardarSchema = z.object({
  curso: z.string().min(1).max(40),
  nivel: z.string().min(1).max(40),
  unidad: z.number().int().min(1).max(4),
  juegos: z.array(juegoSchema).max(50),
});

export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const q = request.nextUrl.searchParams;
  const curso = q.get("curso");
  const nivel = q.get("nivel");
  const unidad = Number(q.get("unidad"));
  if (curso === null || nivel === null || !Number.isInteger(unidad)) {
    throw new ValidationError("Indica curso, nivel y unidad.");
  }
  return json({ juegos: await juegosDeUnidad(curso, nivel, unidad) });
});

export const PUT = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const b = guardarSchema.parse(await request.json());
  return json(
    await guardarJuegosUnidad({
      actorUserId: auth.userId,
      curso: b.curso,
      nivel: b.nivel,
      unidad: b.unidad,
      juegos: b.juegos.map((j) => ({
        nombre: j.nombre,
        enlace: j.enlace,
        ...(j.x !== undefined ? { x: j.x } : {}),
        ...(j.y !== undefined ? { y: j.y } : {}),
      })),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
