import { completarPerfilNino, fichaPorEnlacePerfil } from "@/modules/contracts";
import { ValidationError } from "@/platform/errors";
import { handler, json } from "@/platform/http/handler";

/**
 * Puerta PÚBLICA de /crear-perfil/[token]: el niño ve su usuario, elige su
 * clave, completa su perfil y agenda su Welcome.
 *
 * Sin sesión a propósito: todavía no eligió su clave. La credencial es el token
 * del enlace que recibió su apoderado —32 bytes de azar, un solo uso—, que el
 * módulo valida en cada llamada. Un token desconocido no devuelve nada.
 */

const SIN_CACHE = { headers: { "Cache-Control": "no-store" } };

function token(valor: unknown): string {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (t === "") throw new ValidationError("Falta el enlace.");
  return t;
}

function texto(form: FormData, campo: string): string {
  const v = form.get(campo);
  return typeof v === "string" ? v : "";
}

export const GET = handler(async (request) => {
  return json(await fichaPorEnlacePerfil(token(request.nextUrl.searchParams.get("t"))), SIN_CACHE);
});

export const POST = handler(async (request) => {
  const form = await request.formData().catch(() => null);
  if (form === null) {
    throw new ValidationError("Envía el formulario como multipart/form-data.");
  }
  const archivo = form.get("foto");
  const foto =
    archivo instanceof File && archivo.size > 0
      ? {
          nombre: archivo.name,
          mime: archivo.type,
          bytes: Buffer.from(await archivo.arrayBuffer()),
        }
      : null;

  const r = await completarPerfilNino(
    token(texto(form, "t")),
    {
      clave: texto(form, "clave"),
      confirmacion: texto(form, "confirmacion"),
      sobreTi: texto(form, "sobreTi"),
      hobbies: texto(form, "hobbies"),
      fechaNacimiento: texto(form, "fechaNacimiento"),
      welcomeId: texto(form, "welcomeId"),
      foto,
    },
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  );
  return json({ ok: true, ...r }, SIN_CACHE);
});
