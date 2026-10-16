import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { LARGO_JUSTIFICACION, justificarInasistencia } from "@/modules/attendance";
import { bootstrapIdentity } from "@/modules/identity";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * POST — Servicio › "Justificar": AUSENTE → JUSTIFICADO con el motivo y, si lo
 * hay, el SOPORTE que mandó la familia (PDF o foto). Multipart
 * (`justificacion` + `soporte`) o JSON (`{ justificacion }`). Exige marcar
 * asistencia Y ver personas (servicio, no el guía, que justifica desde su
 * sesión). Alcance por país.
 */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
  profile.requireOpcion("op.servicio.justificar");
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const attendanceId = z.uuid().parse((await context.params)["attendanceId"]);

  let justificacion: unknown;
  let soporte: { nombre: string; mime: string; bytes: Buffer } | null = null;
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData();
    justificacion = form.get("justificacion");
    const archivo = form.get("soporte");
    if (archivo instanceof File && archivo.size > 0) {
      soporte = {
        nombre: archivo.name,
        mime: archivo.type,
        bytes: Buffer.from(await archivo.arrayBuffer()),
      };
    } else if (archivo !== null && !(archivo instanceof File)) {
      throw new ValidationError("El soporte tiene que ser un archivo.");
    }
  } else {
    justificacion = ((await request.json()) as { justificacion?: unknown }).justificacion;
  }

  return json(
    await justificarInasistencia({
      actorUserId: auth.userId,
      attendanceId,
      justificacion: z.string().min(1).max(LARGO_JUSTIFICACION).parse(justificacion),
      countryScope: auth.countryScope,
      soporte,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
