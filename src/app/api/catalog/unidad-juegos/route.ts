import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  ALTO_ZONA,
  ANCHO_ZONA,
  guardarPosicionesUnidad,
  juegosDeUnidad,
  leccionesSinCasilla,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * JUEGOS de una unidad del mapa: son las ACTIVIDADES de las lecciones de esa
 * unidad, no un dato aparte. Se leen de `catalog_curso`.
 *
 * El PUT solo guarda la POSICIÓN sobre la lámina; el nombre y el enlace se
 * editan en Gestión de Contenido, que sigue siendo su único dueño.
 *
 * Ver = `catalogo.ver`; colocar = `catalogo.gestionar`.
 */

const posicionSchema = z.object({
  cursoRefId: z.uuid(),
  indice: z.number().int().min(0).max(200),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  w: z.number().min(0).max(100).optional(),
  h: z.number().min(0).max(100).optional(),
});

const guardarSchema = z.object({
  posiciones: z.array(posicionSchema).max(200),
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
  // `sinCasilla` acompaña siempre: sin él, una unidad vacía no distingue "aún
  // no hay actividades" de "las hay, pero en una lección que el mapa no abre".
  const [juegos, sinCasilla] = await Promise.all([
    juegosDeUnidad(curso, nivel, unidad),
    leccionesSinCasilla(curso, nivel),
  ]);
  // El tamaño por defecto viaja resuelto para que el editor no lo copie.
  return json({ juegos, sinCasilla, zona: { ancho: ANCHO_ZONA, alto: ALTO_ZONA } });
});

export const PUT = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_GESTIONAR);
  const b = guardarSchema.parse(await request.json());
  return json(
    await guardarPosicionesUnidad({
      actorUserId: auth.userId,
      // Cada coordenada se pasa TAL CUAL: descartar aquí la que venga sola
      // dejaría muda la regla del dominio y la posición se perdería callada.
      posiciones: b.posiciones.map((p) => ({
        cursoRefId: p.cursoRefId,
        indice: p.indice,
        ...(p.x !== undefined ? { x: p.x } : {}),
        ...(p.y !== undefined ? { y: p.y } : {}),
        ...(p.w !== undefined ? { w: p.w } : {}),
        ...(p.h !== undefined ? { h: p.h } : {}),
      })),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
