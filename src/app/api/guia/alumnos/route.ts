import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { misAlumnos, nombreDeGuia } from "@/modules/reporting";
import { guiasConZoom } from "@/modules/scheduling";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/guia/alumnos — "Mis alumnos por curso": los salones del guía con sus
 * niños, asistencia, casos y libro.
 *
 * El guía ve SOLO lo suyo. Coordinación (`salones.gestionar`) elige a qué guía
 * mirar con `?guia=`, como el panel de guías de MOSAICO, y recibe la lista de
 * guías para elegir.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  const coordina = profile.hasPermission(PERMISOS.SALONES_GESTIONAR);
  if (!coordina) profile.requirePermission(PERMISOS.PANEL_GUIA);
  const pedido = request.nextUrl.searchParams.get("guia");
  const guiaUserId = pedido !== null && pedido !== "" ? z.uuid().parse(pedido) : auth.userId;
  if (guiaUserId !== auth.userId && !coordina) {
    throw new ForbiddenError("Solo puedes ver tus propios salones.");
  }
  return json({
    guia: { id: guiaUserId, nombre: await nombreDeGuia(guiaUserId) },
    salones: await misAlumnos(guiaUserId),
    // Solo coordinación elige guía.
    guias: coordina ? (await guiasConZoom()).map((g) => ({ id: g.id, nombre: g.nombre })) : [],
  });
});
