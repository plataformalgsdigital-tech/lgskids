import { NextResponse } from "next/server";
import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";
import {
  archivoFacturaPropia,
  misHorasGuia,
  quitarFacturaGuia,
  subirFacturaGuia,
} from "../application/facturas-guias";

/**
 * "Mis horas y facturas" del GUÍA. La identidad sale SIEMPRE de la sesión: un guía
 * solo ve sus horas y solo sube o descarga sus propias facturas.
 */

/** GET /api/guia/mis-horas?periodo=AAAA-MM */
export const misHorasHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_GUIA);
  const periodo = new URL(request.url).searchParams.get("periodo") ?? "";
  return json(await misHorasGuia(auth.userId, periodo));
});

/** POST /api/guia/mis-horas/factura — multipart: file, periodo, corte. */
export const subirFacturaHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_GUIA);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Adjunta el archivo de la factura.");
  return json(
    await subirFacturaGuia({
      guiaUserId: auth.userId,
      periodo: String(form.get("periodo") ?? ""),
      corte: String(form.get("corte") ?? ""),
      nombre: file.name,
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      concepto: texto(form.get("concepto")),
      modo: texto(form.get("modo")),
      reemplazaId: texto(form.get("reemplazaId")),
    }),
  );
});

function texto(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** DELETE /api/guia/mis-horas/factura/[id] — retira una factura propia del corte. */
export const quitarFacturaHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_GUIA);
  const params = await context.params;
  return json(await quitarFacturaGuia(auth.userId, z.uuid().parse(params["id"])));
});

/** GET /api/guia/mis-horas/factura/[id] — descarga una factura propia. */
export const archivoFacturaHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_GUIA);
  const params = await context.params;
  const { meta, bytes } = await archivoFacturaPropia(auth.userId, z.uuid().parse(params["id"]));
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(meta.nombreOriginal)}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
