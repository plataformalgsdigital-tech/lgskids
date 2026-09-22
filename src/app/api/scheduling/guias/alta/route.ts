import { z } from "zod";
import { PERMISOS, ROLES, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import { MIMES_FOTO_GUIA, crearGuia } from "@/modules/scheduling";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

// Lo obligatorio según el modo lo decide `crearGuia`; aquí solo formato.
const datosSchema = z.object({
  nombres: z.string().trim().min(1).max(120),
  apellidos: z.string().trim().min(1).max(120),
  email: z.email(),
  docNumero: z.string().trim().max(40).default(""),
  telefono: z.string().max(40).optional(),
  pais: z.enum(["CL", "CO", "EC", "PE"]).optional().or(z.literal("")),
  domicilio: z.string().max(300).optional(),
  fechaNacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  zoomUrl: z.string().max(500).optional(),
  enviarEnlace: z.enum(["si", "no"]).default("no"),
});

/**
 * POST /api/scheduling/guias/alta — ALTA del guía (multipart: datos + `foto`):
 * cuenta con usuario y clave generados, rol `guia` y ficha. Con
 * `enviarEnlace=si` basta nombre, apellido y correo, y se devuelve además el
 * enlace para que el guía complete su ficha. Clave y enlace se ven UNA vez.
 */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  profile.requirePuedeOtorgarRol(ROLES.GUIA);

  const form = await request.formData().catch(() => null);
  if (form === null) throw new ValidationError("Envía el formulario como multipart/form-data.");
  const campos: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") campos[k] = v;
  const datos = datosSchema.parse(campos);

  const archivo = form.get("foto");
  let foto: { nombreOriginal: string; mime: string; bytes: Buffer } | null = null;
  if (archivo instanceof File && archivo.size > 0) {
    if (!MIMES_FOTO_GUIA.includes(archivo.type)) {
      throw new ValidationError("La foto debe ser JPG, PNG o WebP.");
    }
    foto = {
      nombreOriginal: archivo.name,
      mime: archivo.type,
      bytes: Buffer.from(await archivo.arrayBuffer()),
    };
  }

  const resultado = await crearGuia({
    actorUserId: auth.userId,
    datos: {
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      email: datos.email,
      docNumero: datos.docNumero,
      telefono: datos.telefono ?? null,
      pais: datos.pais === "" ? null : (datos.pais ?? null),
      domicilio: datos.domicilio ?? null,
      fechaNacimiento: datos.fechaNacimiento === "" ? null : (datos.fechaNacimiento ?? null),
      zoomUrl: datos.zoomUrl ?? null,
    },
    foto,
    enviarEnlace: datos.enviarEnlace === "si",
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json(
    {
      userId: resultado.userId,
      username: resultado.username,
      passwordInicial: resultado.passwordInicial,
      enlace: resultado.enlace?.enlace ?? null,
      enlaceExpira: resultado.enlace?.expiraEn ?? null,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
});
