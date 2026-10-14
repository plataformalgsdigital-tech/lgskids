import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { listarCancelaciones } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** GET — bandeja de avisos de cancelación (Sesiones › Cancelaciones). `salones.gestionar`. */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.SALONES_GESTIONAR);
  const p = new URL(request.url).searchParams;
  const q = z
    .object({
      estado: z.enum(["PENDIENTE", "APROBADA", "RECHAZADA", "TODAS"]).default("TODAS"),
      desde: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      hasta: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse({
      estado: p.get("estado") || undefined,
      desde: p.get("desde") || undefined,
      hasta: p.get("hasta") || undefined,
    });
  return json({
    cancelaciones: await listarCancelaciones({
      estado: q.estado,
      desde: q.desde ?? null,
      hasta: q.hasta ?? null,
    }),
  });
});
