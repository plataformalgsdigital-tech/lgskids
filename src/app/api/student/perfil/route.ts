import { NextResponse } from "next/server";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { descargarArchivo, listarArchivos, subirArchivo } from "@/modules/files";
import { bootstrapIdentity } from "@/modules/identity";
import { findPersonByUserId, obtenerDetalleNino } from "@/modules/people";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Perfil del ALUMNO. Igual que el resto de /api/student, TODO se deriva de
 * `auth.userId`: un niño solo puede leer y escribir lo suyo. No hay parámetro
 * de identidad en ninguna de estas rutas, así que no se puede pedir el perfil
 * ni la foto de otro niño.
 *
 * La ficha completa (`detalleNino`) trae datos que el niño no necesita ver
 * —documento, número de contrato, referencia externa—; aquí se devuelve
 * SOLO el subconjunto del panel.
 */

/** entidad de `files` donde vive la foto de perfil. */
const ENTIDAD_FOTO = "student_foto";

async function fotoIdDe(personaId: string): Promise<string | null> {
  const archivos = await listarArchivos({ entidad: ENTIDAD_FOTO, entidadId: personaId, limit: 1 });
  return archivos[0]?.id ?? null;
}

export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);

  const persona = await findPersonByUserId(auth.userId);
  if (persona === null) return json({ perfil: null });

  const [detalle, fotoId] = await Promise.all([
    obtenerDetalleNino(persona.id),
    fotoIdDe(persona.id),
  ]);

  // El primer apoderado es el de contacto; se muestra ese.
  const apoderado = detalle.apoderados[0] ?? null;

  return json({
    perfil: {
      nombre: `${detalle.nombres} ${detalle.apellidos}`,
      correo: detalle.correo ?? detalle.personaEmail,
      telefono: detalle.telefono,
      cumpleanos: detalle.fechaNacimiento,
      usuario: detalle.username,
      apoderado:
        apoderado === null
          ? null
          : {
              nombre: apoderado.nombre,
              parentesco: apoderado.parentesco,
              telefono: apoderado.telefono,
              email: apoderado.email,
            },
      // `tieneFoto` decide si el panel ofrece la subida la primera vez.
      tieneFoto: fotoId !== null,
      fotoUrl: fotoId !== null ? "/api/student/perfil/foto" : null,
    },
  });
});

/** POST /api/student/perfil — multipart con `foto`. Reemplaza la vigente. */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);

  const persona = await findPersonByUserId(auth.userId);
  if (persona === null) throw new ValidationError("El usuario no tiene ficha de alumno.");

  const form = await request.formData().catch(() => null);
  const archivo = form?.get("foto");
  if (form === null || !(archivo instanceof File)) {
    throw new ValidationError("Envía multipart/form-data con el campo 'foto'.");
  }
  if (!archivo.type.startsWith("image/")) {
    throw new ValidationError("La foto debe ser una imagen (JPG, PNG o WebP).");
  }

  // `subirArchivo` ya valida MIME permitido y tamaño máximo (10 MB).
  await subirArchivo({
    actorUserId: auth.userId,
    nombreOriginal: archivo.name,
    mime: archivo.type,
    bytes: Buffer.from(await archivo.arrayBuffer()),
    entidad: ENTIDAD_FOTO,
    entidadId: persona.id,
  });

  return json({ fotoUrl: "/api/student/perfil/foto" }, { status: 201 });
});

/**
 * Sirve la foto del alumno LOGUEADO. Privada (dato de un menor): sin sesión no
 * hay imagen, y como la ruta no acepta id, nadie puede pedir la de otro niño.
 */
export const fotoHandler = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);

  const persona = await findPersonByUserId(auth.userId);
  const fotoId = persona === null ? null : await fotoIdDe(persona.id);
  if (fotoId === null) return new NextResponse(null, { status: 404 });

  const { meta, bytes } = await descargarArchivo(fotoId);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": meta.mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
});
