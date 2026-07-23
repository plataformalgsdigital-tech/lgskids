import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { descargarArchivo } from "@/modules/files";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth } from "@/platform/http/handler";
import { NextResponse } from "next/server";

bootstrapIdentity();

/** GET /api/files/[id] — descarga AUTENTICADA (privado por defecto, ADR-0006). */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ARCHIVOS_VER);
  const params = await context.params;
  const id = z.uuid().parse(params["id"]);
  const { meta, bytes } = await descargarArchivo(id);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(meta.nombreOriginal)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
