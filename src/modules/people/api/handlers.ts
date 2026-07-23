import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { crearAdulto, crearNino, listarPersonas } from "../application/crear-personas";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const personaSchema = z.object({
  nombres: z.string().min(2).max(60),
  apellidos: z.string().min(2).max(60),
  fechaNacimiento: z.string().regex(ISO_DATE).nullish(),
  docTipo: z.string().min(2).max(15),
  docNumero: z.string().min(3).max(30),
  countryCode: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase()),
  email: z.email().nullish(),
  telefono: z.string().max(25).nullish(),
});

const crearNinoSchema = z
  .object({
    nino: personaSchema.extend({
      fechaNacimiento: z.string().regex(ISO_DATE, "Fecha YYYY-MM-DD obligatoria"),
    }),
    apoderadoId: z.uuid().optional(),
    apoderadoNuevo: personaSchema.optional(),
    parentesco: z.string().max(30).nullish(),
  })
  .refine((v) => (v.apoderadoId === undefined) !== (v.apoderadoNuevo === undefined), {
    message: "Indica apoderadoId O apoderadoNuevo (exactamente uno).",
  });

/** POST /api/people — crea un adulto (apoderado/titular). */
export const crearAdultoHandler = handlerWithAuth(async (request, auth) => {
  const body = personaSchema.parse(await request.json());
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PERSONAS_GESTIONAR, body.countryCode);
  const id = await crearAdulto({ actorUserId: auth.userId, ...body });
  return json({ id }, { status: 201 });
});

/** POST /api/people/ninos — crea niño + apoderado en una transacción. */
export const crearNinoHandler = handlerWithAuth(async (request, auth) => {
  const body = crearNinoSchema.parse(await request.json());
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PERSONAS_GESTIONAR, body.nino.countryCode);
  const resultado = await crearNino({
    actorUserId: auth.userId,
    nino: body.nino,
    ...(body.apoderadoId !== undefined && { apoderadoId: body.apoderadoId }),
    ...(body.apoderadoNuevo !== undefined && { apoderadoNuevo: body.apoderadoNuevo }),
    parentesco: body.parentesco ?? null,
  });
  return json(resultado, { status: 201 });
});

const listarSchema = z.object({
  buscar: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/people — lista con ALCANCE POR PAÍS del solicitante. */
export const listarPersonasHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PERSONAS_VER);
  const query = listarSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const personas = await listarPersonas({
    countryScope: auth.countryScope,
    ...(query.buscar !== undefined && { buscar: query.buscar }),
    limit: query.limit,
    offset: query.offset,
  });
  return json({ personas });
});
