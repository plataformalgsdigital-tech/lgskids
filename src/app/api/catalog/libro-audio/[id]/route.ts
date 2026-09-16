import { NextResponse } from "next/server";
import { audioPerteneceALibro } from "@/modules/catalog";
import { descargarArchivo } from "@/modules/files";
import { bootstrapIdentity } from "@/modules/identity";
import { NotFoundError } from "@/platform/errors";
import { handlerWithAuth } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * GET /api/catalog/libro-audio/[id] — una pista del cuadernillo.
 *
 * Autenticada como todo el material, pero además comprueba que el archivo sea
 * REALMENTE una pista de un libro: sin eso, este endpoint sería una puerta
 * para pedir cualquier archivo de `files` —incluidas las fotos de menores—
 * con solo tener sesión.
 *
 * Los bytes de un id no cambian nunca, así que se cachea como el resto del
 * arte. Sigue siendo `private`: es material del alumno.
 */
export const GET = handlerWithAuth(async (_request, _auth, context) => {
  const { id } = (await (context as { params: Promise<{ id: string }> }).params) ?? { id: "" };
  if (!(await audioPerteneceALibro(id))) {
    throw new NotFoundError("Esa pista no existe.");
  }
  const { meta, bytes } = await descargarArchivo(id);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=31536000, immutable",
      // Permite que el navegador pida trozos: una pista se adelanta y se
      // repite sin volver a bajarla entera.
      "Accept-Ranges": "bytes",
    },
  });
});
