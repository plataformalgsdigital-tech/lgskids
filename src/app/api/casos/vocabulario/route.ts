import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  AREAS,
  AREA_DE_ESCALAMIENTO,
  CANALES,
  CIERRES_POR_AREA,
  ESTADOS,
  ESTADOS_QUE_CIERRAN,
  ETIQUETA_AREA,
  ETIQUETA_ESTADO,
  ETIQUETA_RESULTADO,
  ETIQUETA_TEMA,
  RESULTADOS,
  TEMAS,
} from "@/modules/casos";
import { bootstrapIdentity } from "@/modules/identity";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET — el vocabulario de los casos (tipos, estados, áreas, cierres por área,
 * canales, resultados) con sus etiquetas. Lo sirve el dominio para que las
 * pantallas no copien las listas: si cambian, cambian en un solo lugar. Lo
 * necesitan el guía (para reportar) y el equipo de Servicio.
 */
export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  if (
    !profile.hasPermission(PERMISOS.CASOS_VER) &&
    !profile.hasPermission(PERMISOS.ASISTENCIA_GESTIONAR)
  ) {
    throw new ForbiddenError("No tienes acceso a los casos de atención.");
  }
  return json(
    {
      temas: TEMAS.map((v) => ({ valor: v, etiqueta: ETIQUETA_TEMA[v] })),
      estados: ESTADOS.map((v) => ({
        valor: v,
        etiqueta: ETIQUETA_ESTADO[v],
        cierra: ESTADOS_QUE_CIERRAN.includes(v),
      })),
      areas: AREAS.map((v) => ({ valor: v, etiqueta: ETIQUETA_AREA[v] })),
      cierresPorArea: CIERRES_POR_AREA,
      // Desde un área solo se escala a esta (hoy, Dirección).
      escalaA: AREA_DE_ESCALAMIENTO,
      canales: CANALES,
      resultados: RESULTADOS.map((v) => ({ valor: v, etiqueta: ETIQUETA_RESULTADO[v] })),
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
});
