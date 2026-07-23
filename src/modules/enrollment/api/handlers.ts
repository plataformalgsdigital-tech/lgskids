import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { cambioAcademico, matricular, obtenerRoster } from "../application/matricula";

function ip(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

const matricularSchema = z.object({
  contractId: z.uuid(),
  classroomId: z.uuid(),
});

/** POST /api/enrollment — matricula un contrato aprobado en un salón. */
export const matricularHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MATRICULAS_GESTIONAR);
  const body = matricularSchema.parse(await request.json());
  const resultado = await matricular({ actorUserId: auth.userId, ...body, ip: ip(request) });
  return json(resultado, { status: 201 });
});

/** GET /api/enrollment?classroomId= — roster DERIVADO de matrículas activas. */
export const rosterHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MATRICULAS_VER);
  const classroomId = z.uuid().parse(request.nextUrl.searchParams.get("classroomId"));
  return json({ roster: await obtenerRoster(classroomId) });
});

const moverSchema = z.object({
  nuevoClassroomId: z.uuid(),
  motivo: z.string().min(5).max(300),
});

/** POST /api/enrollment/[id]/move — cambio académico con motivo auditado. */
export const cambioAcademicoHandler = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MATRICULAS_GESTIONAR);
  const params = await context.params;
  const enrollmentId = z.uuid().parse(params["id"]);
  const body = moverSchema.parse(await request.json());
  const resultado = await cambioAcademico({
    actorUserId: auth.userId,
    enrollmentId,
    ...body,
    ip: ip(request),
  });
  return json(resultado);
});
