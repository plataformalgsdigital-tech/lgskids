import { completarInvitacionGuia, fichaPorInvitacion } from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handler, json } from "@/platform/http/handler";

/**
 * Puerta PÚBLICA del wizard /nuevo-guia.
 *
 * Sin sesión a propósito: el guía todavía no entra al panel. La credencial es
 * el token del enlace —32 bytes de azar, un solo uso, con vencimiento y ligado
 * a un guía activo—, que el módulo valida en cada llamada. Sin token no se
 * devuelve ni se escribe nada.
 */

const FOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function token(valor: unknown): string {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (t === "") throw new ValidationError("Falta el enlace de registro.");
  return t;
}

function texto(form: FormData, campo: string): string {
  const v = form.get(campo);
  return typeof v === "string" ? v : "";
}

export const GET = handler(async (request) => {
  const t = token(request.nextUrl.searchParams.get("t"));
  return json(await fichaPorInvitacion(t));
});

export const POST = handler(async (request) => {
  const form = await request.formData().catch(() => null);
  if (form === null) {
    throw new ValidationError("Envía el formulario como multipart/form-data.");
  }

  // La foto es de una persona identificable: se restringe a imagen (el módulo
  // `files` acepta además PDF, que aquí no tiene sentido).
  const archivo = form.get("foto");
  let foto: { nombreOriginal: string; mime: string; bytes: Buffer } | null = null;
  if (archivo instanceof File && archivo.size > 0) {
    if (!FOTO_MIMES.has(archivo.type)) {
      throw new ValidationError("La foto debe ser JPG, PNG o WebP.");
    }
    foto = {
      nombreOriginal: archivo.name,
      mime: archivo.type,
      bytes: Buffer.from(await archivo.arrayBuffer()),
    };
  }

  const r = await completarInvitacionGuia({
    token: token(texto(form, "t")),
    datos: {
      nombres: texto(form, "nombres"),
      apellidos: texto(form, "apellidos"),
      docNumero: texto(form, "docNumero"),
      email: texto(form, "email"),
      telefono: texto(form, "telefono"),
      pais: texto(form, "pais"),
      domicilio: texto(form, "domicilio"),
      fechaNacimiento: texto(form, "fechaNacimiento"),
      zoomUrl: texto(form, "zoomUrl"),
    },
    foto,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true, username: r.username });
});
