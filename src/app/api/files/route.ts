import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { subirArchivo, listarArchivos } from "@/modules/files";
import { bootstrapIdentity } from "@/modules/identity";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/** POST /api/files — multipart/form-data con "archivo" (+ entidad/entidadId). */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ARCHIVOS_GESTIONAR);

  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  if (form === null || !(archivo instanceof File)) {
    throw new ValidationError("Envía multipart/form-data con el campo 'archivo'.");
  }
  const entidad = form.get("entidad");
  const entidadId = form.get("entidadId");

  const resultado = await subirArchivo({
    actorUserId: auth.userId,
    nombreOriginal: archivo.name,
    mime: archivo.type,
    bytes: Buffer.from(await archivo.arrayBuffer()),
    entidad: typeof entidad === "string" && entidad !== "" ? entidad : null,
    entidadId: typeof entidadId === "string" && entidadId !== "" ? entidadId : null,
  });
  return json(resultado, { status: 201 });
});

const listarSchema = z.object({
  entidad: z.string().min(1).optional(),
  entidadId: z.string().min(1).optional(),
});

/** GET /api/files?entidad=&entidadId= — metadatos (nunca URLs públicas). */
export const GET = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.ARCHIVOS_VER);
  const query = listarSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return json({
    archivos: await listarArchivos({
      ...(query.entidad !== undefined && { entidad: query.entidad }),
      ...(query.entidadId !== undefined && { entidadId: query.entidadId }),
    }),
  });
});
