import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { listarRefuerzos } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Bandeja de REFUERZOS: solicitudes de repetición que el guía marcó y que
 * coordinación autoriza o no.
 *
 * Es de coordinación, no del guía: por eso `salones.gestionar` y no
 * `salones.ver`, que el guía tiene para su propio calendario.
 */

const ESTADOS = ["PENDIENTE", "APROBADA", "RECHAZADA", "TODAS"] as const;

export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);

  const q = request.nextUrl.searchParams;
  const estadoQ = q.get("estado");
  const estado = (ESTADOS as readonly string[]).includes(estadoQ ?? "")
    ? (estadoQ as (typeof ESTADOS)[number])
    : "PENDIENTE";

  return json({
    refuerzos: await listarRefuerzos({
      estado,
      guiaUserId: q.get("guia"),
      cursoTipo: q.get("curso"),
      classroomId: q.get("salon"),
      desde: q.get("desde"),
      hasta: q.get("hasta"),
    }),
  });
});
