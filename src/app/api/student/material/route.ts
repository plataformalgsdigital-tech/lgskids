import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  MENSAJE_ALMACEN_LIBRO,
  PREFIJO_NOMBRE_LIBRO,
  SANDBOX_LIBRO,
  baseVideosLibro,
  materialVigente,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { alcanceDelAlumno } from "./alcance";

bootstrapIdentity();

/**
 * GET /api/student/material — los libros del niño logueado.
 *
 * Un renglón por nivel alcanzado, el actual primero (es el que está
 * trabajando), cada uno con su libro interactivo y su PDF si están cargados.
 *
 * `libro` lleva las constantes de la caja del visor: los permisos del iframe
 * y cómo habla el puente de almacenamiento. Viajan en la respuesta para que el
 * panel no las copie — si cambian aquí, el visor cambia con ellas.
 */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const { personaId, curso, actual, alcanzados } = await alcanceDelAlumno(auth.userId);

  const niveles = await Promise.all(
    alcanzados.map(async (nivel) => {
      const [interactivo, imprimible] = await Promise.all([
        materialVigente("interactivo", curso, nivel),
        materialVigente("imprimible", curso, nivel),
      ]);
      const url = (id: string) => `/api/student/material/${id}`;
      return {
        nivel,
        actual: nivel === actual,
        interactivoUrl: interactivo !== null ? url(interactivo.id) : null,
        // La base de SUS videos, con un token recién firmado: el libro la usa
        // para pedir `videos/7-1.mp4` sin cookie. Se emite aquí porque aquí ya
        // se comprobó que el niño alcanzó este nivel.
        videosBase: interactivo !== null ? baseVideosLibro(interactivo.id) : null,
        imprimibleUrl: imprimible !== null ? `${url(imprimible.id)}?descargar=1` : null,
      };
    }),
  );
  niveles.sort((a, b) => Number(b.actual) - Number(a.actual));

  return json({
    curso,
    // Clave del progreso guardado en este dispositivo: por NIÑO, para que dos
    // hermanos que comparten tableta no se pisen las respuestas.
    alumno: personaId,
    niveles,
    libro: {
      sandbox: SANDBOX_LIBRO,
      prefijo: PREFIJO_NOMBRE_LIBRO,
      mensaje: MENSAJE_ALMACEN_LIBRO,
    },
  });
});
