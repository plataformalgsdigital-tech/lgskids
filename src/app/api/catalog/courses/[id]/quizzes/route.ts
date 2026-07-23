import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { cuestionariosDeCurso } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** GET /api/catalog/courses/[id]/quizzes — cuestionarios del curso. */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CATALOGO_VER);
  const params = await context.params;
  const courseId = z.uuid().parse(params["id"]);
  return json({ cuestionarios: await cuestionariosDeCurso(courseId) });
});
