import { z } from "zod";
import { listarAuditoria } from "@/modules/audit";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const querySchema = z.object({
  entidad: z.string().min(1).optional(),
  accion: z.string().min(1).optional(),
  actorUserId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/audit — requiere permiso auditoria.ver. Siempre paginado. */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.AUDITORIA_VER);

  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const registros = await listarAuditoria({
    ...(query.entidad !== undefined && { entidad: query.entidad }),
    ...(query.accion !== undefined && { accion: query.accion }),
    ...(query.actorUserId !== undefined && { actorUserId: query.actorUserId }),
    limit: query.limit,
    offset: query.offset,
  });
  return json({ registros, limit: query.limit, offset: query.offset });
});
