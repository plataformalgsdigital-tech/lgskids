import { NextResponse } from "next/server";
import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { audioNivelBloqueado } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { NotFoundError } from "@/platform/errors";
import { handlerWithAuth } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/student/aviso-voz?quien=simba|emma — el MP3 con que el personaje dice
 * «Aún no puedes acceder a este mapa…» (panel del alumno › Avance). Se genera con
 * ElevenLabs la primera vez y de ahí en adelante se sirve el archivo guardado. Si no
 * se puede generar responde 404 y el panel usa la voz del dispositivo.
 */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const quien = z
    .enum(["simba", "emma"])
    .parse(request.nextUrl.searchParams.get("quien") ?? "simba");
  const bytes = await audioNivelBloqueado(quien, auth.userId);
  if (bytes === null) throw new NotFoundError("La voz del personaje no está disponible.");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
});
