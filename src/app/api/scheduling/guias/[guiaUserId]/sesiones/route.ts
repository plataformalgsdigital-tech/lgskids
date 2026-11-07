import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { agenda } from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD.");
/** Tope del rango: la pestaña mira semanas, no el año entero. */
const DIAS_MAXIMOS = 93;

/**
 * GET /api/scheduling/guias/[guiaUserId]/sesiones?from=&to= — las sesiones que
 * DICTA un guía (pestaña "Asistencia" de su ficha en Guías).
 *
 * Es la MISMA agenda del calendario filtrada por el guía EFECTIVO de cada sesión
 * (un reemplazo de un día cuenta para quien lo cubre; un Club para "Todos", para
 * su advisor). Pasar lista y registrar se hacen en el modal de la sesión, por las
 * rutas de siempre, que vuelven a exigir sus permisos.
 *
 * Quién: quien administra las fichas de guías (`usuarios.gestionar`) y ve el
 * calendario (`salones.ver`).
 */
export const GET = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  profile.requirePermission(PERMISOS.SALONES_VER);
  const guiaUserId = z.uuid().parse((await context.params)["guiaUserId"]);
  const q = request.nextUrl.searchParams;
  const desde = fecha.parse(q.get("from"));
  const hasta = fecha.parse(q.get("to"));
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  if (dias < 0 || dias > DIAS_MAXIMOS) {
    throw new ValidationError(`El rango va de 0 a ${String(DIAS_MAXIMOS)} días.`);
  }
  return json({ sesiones: await agenda({ desde, hasta, guiaUserId }) });
});
