import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { sugerenciasFestivo } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/scheduling/festivos/sugerencias — las clases de ese día a las que se puede
 * pasar a un niño afectado, de mejor a peor. Por defecto las de su campaña y curso;
 * con `amplio=1`, las de cualquier campaña, curso y salón (lo elige coordinación).
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  profile.requireOpcion("op.sesiones.festivos");
  const p = request.nextUrl.searchParams;
  const q = z
    .object({
      childPersonId: z.uuid(),
      classroomId: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      perdidaStartsAt: z.string().min(10),
      amplio: z.enum(["0", "1"]).default("0"),
    })
    .parse({
      childPersonId: p.get("childPersonId"),
      classroomId: p.get("classroomId"),
      fecha: p.get("fecha"),
      perdidaStartsAt: p.get("perdidaStartsAt"),
      amplio: p.get("amplio") || undefined,
    });
  const amplio = q.amplio === "1";
  // Ver clases de otra campaña o curso es parte de aprobar: lo decide quien aprueba.
  if (amplio) profile.requireOpcion("op.sesiones.festivos_aprobar");
  return json(
    await sugerenciasFestivo({
      childPersonId: q.childPersonId,
      countryScope: auth.countryScope,
      fecha: q.fecha,
      perdidaStartsAt: q.perdidaStartsAt,
      classroomId: q.classroomId,
      amplio,
    }),
  );
});
