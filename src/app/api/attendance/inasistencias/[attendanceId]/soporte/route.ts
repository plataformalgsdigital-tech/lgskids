import { NextResponse } from "next/server";
import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { soporteDeInasistencia } from "@/modules/attendance";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET — el soporte adjunto a una justificación. Por el id de la MARCA, nunca
 * por el del archivo (regla 9: datos de menores). Ver personas y asistencia,
 * con alcance por país. Sin caché compartida.
 */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  profile.requirePermission(PERMISOS.ASISTENCIA_VER);
  const attendanceId = z.uuid().parse((await context.params)["attendanceId"]);
  const s = await soporteDeInasistencia(attendanceId, auth.countryScope);
  // Un PDF o una imagen se ven en la pestaña; el nombre va saneado.
  const nombre = s.nombre.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(new Uint8Array(s.bytes), {
    headers: {
      "Content-Type": s.mime,
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
