import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { archivoDeMaterial, respuestaMaterial } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { NotFoundError } from "@/platform/errors";
import { handlerWithAuth } from "@/platform/http/handler";
import { alcanceDelAlumno } from "../alcance";

bootstrapIdentity();

/**
 * GET /api/student/material/[id][?descargar=1] — sirve un libro al NIÑO.
 *
 * Dos comprobaciones, y las dos importan:
 * 1. que el archivo SEA material (si no, esta ruta serviría cualquier archivo
 *    de `files` —fotos de menores incluidas— a quien tuviera el id);
 * 2. que sea de SU curso y de un nivel que ya alcanzó.
 * Cualquiera que falle responde 404, no 403: no se confirma que el id exista.
 */
export const GET = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const id = z.uuid().parse((await context.params)["id"]);

  const [material, alcance] = await Promise.all([
    archivoDeMaterial(id),
    alcanceDelAlumno(auth.userId),
  ]);
  if (
    material === null ||
    material.curso !== alcance.curso ||
    !alcance.alcanzados.includes(material.nivel)
  ) {
    throw new NotFoundError("Ese material no está en tu recorrido.");
  }
  return respuestaMaterial(id, material, {
    descargar: request.nextUrl.searchParams.get("descargar") === "1",
    origen: request.nextUrl.origin,
  });
});
