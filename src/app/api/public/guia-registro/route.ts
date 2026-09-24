import { estadoPublicoRegistro, registrarGuiaAbierto } from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handler, json } from "@/platform/http/handler";

/**
 * Puerta PÚBLICA del registro abierto de guías (`/nuevo-guia` sin enlace).
 *
 * Sin sesión a propósito: el guía todavía no tiene cuenta — la crea aquí. Lo
 * que la sostiene está en `scheduling/application/registro-abierto.ts`: el
 * interruptor, la clave compartida y el tope por IP. Esta ruta solo traduce el
 * formulario; ninguna comprobación vive en ella.
 *
 * El GET dice únicamente si está abierto y si pide clave. La clave NO viaja:
 * se dicta por otro canal, si no el freno no frenaría nada.
 */

const FOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function texto(form: FormData, campo: string): string {
  const v = form.get(campo);
  return typeof v === "string" ? v : "";
}

const ip = (request: Request): string | null =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

export const GET = handler(async () => json(await estadoPublicoRegistro()));

export const POST = handler(async (request) => {
  const form = await request.formData().catch(() => null);
  if (form === null) {
    throw new ValidationError("Envía el formulario como multipart/form-data.");
  }

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

  const cuenta = await registrarGuiaAbierto({
    codigo: texto(form, "codigo"),
    datos: {
      nombres: texto(form, "nombres"),
      apellidos: texto(form, "apellidos"),
      email: texto(form, "email"),
      docNumero: texto(form, "docNumero"),
      telefono: texto(form, "telefono"),
      pais: texto(form, "pais"),
      domicilio: texto(form, "domicilio"),
      fechaNacimiento: texto(form, "fechaNacimiento"),
      zoomUrl: texto(form, "zoomUrl"),
    },
    foto,
    ip: ip(request),
  });

  // La clave se devuelve UNA vez y no debe quedar en ninguna caché.
  return json(
    { ok: true, username: cuenta.username, password: cuenta.passwordInicial },
    { headers: { "Cache-Control": "no-store" } },
  );
});
