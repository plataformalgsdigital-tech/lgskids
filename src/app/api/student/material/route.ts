import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  CLAVE_AUTORIZACIONES_LIBRO,
  MENSAJE_ALMACEN_LIBRO,
  PARADAS,
  PARADA_WELCOME,
  PREFIJO_NOMBRE_LIBRO,
  autorizacionParaLibro,
  baseVideosLibro,
  etiquetaParada,
  materialVigente,
  misionesAutorizadas,
  todasLasUnidades,
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
 * `libro` lleva cómo habla el puente de almacenamiento (el prefijo del
 * `window.name` y el tipo de mensaje). Viaja en la respuesta para que el panel
 * no lo copie — si cambia aquí, cambia con ello. La CAJA en sí va en la CSP de
 * cada libro: el panel abre su pestaña, no la configura.
 */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const { personaId, curso, actual, alcanzados } = await alcanceDelAlumno(auth.userId);

  const niveles = await Promise.all(
    alcanzados.map(async (nivel) => {
      const abiertas = await misionesAutorizadas(personaId, curso, nivel);
      const [interactivo, actividadesCompleto, ...pdfs] = await Promise.all([
        materialVigente("interactivo", curso, nivel),
        materialVigente("actividades", curso, nivel),
        ...PARADAS.map((parada) => materialVigente("imprimible", curso, nivel, parada)),
        ...PARADAS.map((parada) => materialVigente("actividades", curso, nivel, parada)),
      ]);
      const url = (id: string) => `/api/student/material/${id}`;

      /**
       * Las CINCO unidades, siempre a la vista: el niño ve el camino completo
       * y se le van habilitando de a una. Cerrada = sin enlace (la ruta que
       * las sirve lo vuelve a comprobar); sin archivo = todavía sin cargar.
       */
      const casillas = (desde: number) =>
        PARADAS.map((parada, i) => {
          const pdf = pdfs[desde + i] ?? null;
          const abierta = parada === PARADA_WELCOME || abiertas.includes(parada);
          return {
            parada,
            etiqueta: etiquetaParada(parada),
            cargado: pdf !== null,
            abierta,
            url: pdf !== null && abierta ? `${url(pdf.id)}?descargar=1` : null,
          };
        });
      return {
        nivel,
        actual: nivel === actual,
        interactivoUrl: interactivo !== null ? url(interactivo.id) : null,
        // El camino abierto: el Welcome y todo lo que hay hasta la unidad más
        // alta que le abrió su guía (quien va en la 3 conserva la 1 y la 2).
        // La lista lleva el nombre ya escrito, para que el panel no repita la
        // regla; `autorizacion` es lo mismo, armado para el LIBRO.
        misiones: abiertas.map((parada) => ({ parada, etiqueta: etiquetaParada(parada) })),
        autorizacion: await autorizacionParaLibro(personaId, curso, nivel),
        // La base de SUS videos, con un token recién firmado: el libro la usa
        // para pedir `videos/7-1.mp4` sin cookie. Se emite aquí porque aquí ya
        // se comprobó que el niño alcanzó este nivel.
        videosBase: interactivo !== null ? baseVideosLibro(interactivo.id) : null,
        // Libro para descargar y libro de actividades, los dos por unidad.
        imprimibles: casillas(0),
        actividades: casillas(PARADAS.length),
        // El de actividades del nivel ENTERO: se habilita cuando su guía le
        // abrió las cuatro unidades (decisión del negocio, 2026-09-23).
        actividadesCompleto:
          actividadesCompleto === null
            ? null
            : {
                abierta: todasLasUnidades(abiertas),
                url: todasLasUnidades(abiertas)
                  ? `${url(actividadesCompleto.id)}?descargar=1`
                  : null,
              },
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
      prefijo: PREFIJO_NOMBRE_LIBRO,
      mensaje: MENSAJE_ALMACEN_LIBRO,
      claveAutorizaciones: CLAVE_AUTORIZACIONES_LIBRO,
    },
  });
});
