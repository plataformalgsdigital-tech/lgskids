import { NextResponse } from "next/server";
import { z } from "zod";
import { fotoDeGuia } from "@/modules/scheduling";
import { handlerWithServiceAuth } from "@/platform/http/handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/kids-intake/guias/[guiaUserId]/foto — foto del guía para LGS (la copia
 * a la ficha del advisor Kids). Clave de servicio; 404 si el guía no tiene foto.
 */
export const GET = handlerWithServiceAuth(async (_request, context) => {
  const params = await context.params;
  const guiaUserId = z.uuid().parse(params["guiaUserId"]);
  const { meta, bytes } = await fotoDeGuia(guiaUserId);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": meta.mime, "Cache-Control": "no-store" },
  });
});
