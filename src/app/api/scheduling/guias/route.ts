import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { bootstrapIdentity } from "@/modules/identity";
import {
  DIAS_VIGENCIA_INVITACION,
  enlacesDeGuias,
  fichasDeGuias,
  guardarFichaGuia,
} from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Ficha operativa de los guías: datos de contacto y su sala de Zoom.
 *
 * La CUENTA del guía se crea en Usuarios y roles (`identity_user` + rol). Esto
 * es su ficha: replica el alta de MOSAICO (/nuevo-guia) sin duplicar identidad.
 */

export const GET = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  // Los enlaces van en la misma respuesta: la pantalla muestra ficha y estado
  // del enlace en una sola fila, y separarlos solo añadía una llamada.
  const [guias, enlaces] = await Promise.all([fichasDeGuias(), enlacesDeGuias()]);
  return json({ guias, enlaces, diasVigencia: DIAS_VIGENCIA_INVITACION });
});

const fichaSchema = z.object({
  guiaUserId: z.uuid(),
  nombres: z.string().max(120).nullish(),
  apellidos: z.string().max(120).nullish(),
  docNumero: z.string().max(40).nullish(),
  email: z.email().nullish().or(z.literal("")),
  telefono: z.string().max(40).nullish(),
  pais: z.enum(["CL", "CO", "EC", "PE"]).nullish().or(z.literal("")),
  domicilio: z.string().max(300).nullish(),
  fechaNacimiento: z.string().max(10).nullish(),
  zoomUrl: z.string().max(500).nullish(),
});

export const PUT = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  const b = fichaSchema.parse(await request.json());
  await guardarFichaGuia({
    actorUserId: auth.userId,
    guiaUserId: b.guiaUserId,
    nombres: b.nombres ?? null,
    apellidos: b.apellidos ?? null,
    docNumero: b.docNumero ?? null,
    email: b.email === "" ? null : (b.email ?? null),
    telefono: b.telefono ?? null,
    pais: b.pais === "" ? null : (b.pais ?? null),
    domicilio: b.domicilio ?? null,
    fechaNacimiento: b.fechaNacimiento ?? null,
    zoomUrl: b.zoomUrl ?? null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({ ok: true });
});
