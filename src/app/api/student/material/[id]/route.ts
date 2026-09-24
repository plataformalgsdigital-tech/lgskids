import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  PARADA_WELCOME,
  archivoDeMaterial,
  misionesAutorizadas,
  respuestaMaterial,
  todasLasUnidades,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { NotFoundError } from "@/platform/errors";
import { handlerWithAuth } from "@/platform/http/handler";
import { alcanceDelAlumno } from "../alcance";

bootstrapIdentity();

/**
 * GET /api/student/material/[id][?descargar=1] — sirve un libro al NIÑO.
 *
 * Tres comprobaciones, y las tres importan:
 * 1. que el archivo SEA material (si no, esta ruta serviría cualquier archivo
 *    de `files` —fotos de menores incluidas— a quien tuviera el id);
 * 2. que sea de SU curso y de un nivel que ya alcanzó;
 * 3. si es un PDF, que su guía haya abierto esa unidad. El Welcome va siempre,
 *    como en el libro; el de actividades del nivel entero pide las CUATRO
 *    unidades; y el PDF del nivel entero (los cargados antes de que fuera por
 *    unidad) ya no se sirve: nadie puede abrirlo.
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
  if (material.tipo !== "interactivo") {
    const abiertas = await misionesAutorizadas(alcance.personaId, material.curso, material.nivel);
    const abierta =
      material.parada === null
        ? // Sin unidad: el de ACTIVIDADES del nivel entero, que pide las cuatro
          // abiertas. El PDF del nivel entero (los antiguos) ya no se sirve.
          material.tipo === "actividades" && todasLasUnidades(abiertas)
        : material.parada === PARADA_WELCOME || abiertas.includes(material.parada);
    if (!abierta) throw new NotFoundError("Tu guía todavía no abrió eso.");
  }
  return respuestaMaterial(id, material, {
    descargar: request.nextUrl.searchParams.get("descargar") === "1",
    origen: request.nextUrl.origin,
  });
});
