import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { handlerWithAuth, json } from "@/platform/http/handler";
import {
  aprobarContrato,
  crearContrato,
  crearReservaBeneficiario,
  inactivarContrato,
  listarContratos,
  ponerEnPausa,
  reactivar,
} from "../application/gestion-contratos";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const paisSchema = z
  .string()
  .length(2)
  .transform((c) => c.toUpperCase());

const personaSchema = z.object({
  nombres: z.string().min(1).max(80),
  apellidos: z.string().min(1).max(80),
  fechaNacimiento: z.string().regex(ISO_DATE).nullish(),
  docTipo: z.string().min(1).max(20),
  docNumero: z.string().min(1).max(40),
  countryCode: paisSchema,
  email: z.email().nullish(),
  telefono: z.string().max(30).nullish(),
});

const reservaSchema = z.object({
  externalRef: z.string().min(1).max(60),
  countryCode: paisSchema,
  tipoCurso: z.enum(["JUNIOR", "YOUNGSTER"]),
  inicio: z.string().regex(ISO_DATE),
  finalContrato: z.string().regex(ISO_DATE),
  classroomId: z.uuid(),
  titular: personaSchema,
  titularEsApoderado: z.boolean().optional(),
  apoderadoNuevo: personaSchema.optional(),
  nino: personaSchema.extend({ fechaNacimiento: z.string().regex(ISO_DATE) }),
  parentesco: z.string().max(40).nullish(),
});

const crearSchema = z.object({
  titularId: z.uuid(),
  beneficiarioId: z.uuid(),
  countryCode: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase()),
  tipoCurso: z.enum(["JUNIOR", "YOUNGSTER"]),
  inicio: z.string().regex(ISO_DATE),
  finalContrato: z.string().regex(ISO_DATE),
});

function ip(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function contractIdFromContext(context: {
  params: Promise<Record<string, string | string[]>>;
}): Promise<string> {
  const params = await context.params;
  return z.uuid().parse(params["id"]);
}

/** POST /api/contracts */
export const crearContratoHandler = handlerWithAuth(async (request, auth) => {
  const body = crearSchema.parse(await request.json());
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CONTRATOS_GESTIONAR, body.countryCode);
  const id = await crearContrato({ actorUserId: auth.userId, ...body, ip: ip(request) });
  return json({ id }, { status: 201 });
});

/** POST /api/contracts/reservations — RESERVA de beneficiario desde LGS. */
export const crearReservaHandler = handlerWithAuth(async (request, auth) => {
  const body = reservaSchema.parse(await request.json());
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CONTRATOS_GESTIONAR, body.countryCode);
  const resultado = await crearReservaBeneficiario({
    actorUserId: auth.userId,
    ...body,
    ip: ip(request),
  });
  return json(resultado, { status: 201 });
});

const ISO_DATE_OPT = z.string().regex(ISO_DATE).optional();
const listarSchema = z.object({
  estado: z.enum(["PENDIENTE", "APROBADO", "ONHOLD", "INACTIVO"]).optional(),
  pais: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase())
    .optional(),
  tipoCurso: z.enum(["JUNIOR", "YOUNGSTER"]).optional(),
  campaignId: z.uuid().optional(),
  inicioDesde: ISO_DATE_OPT,
  finalHasta: ISO_DATE_OPT,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/contracts — con alcance por país + filtros. */
export const listarContratosHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CONTRATOS_VER);
  const query = listarSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const contratos = await listarContratos({
    countryScope: auth.countryScope,
    ...(query.estado !== undefined && { estado: query.estado }),
    ...(query.pais !== undefined && { pais: query.pais }),
    ...(query.tipoCurso !== undefined && { tipoCurso: query.tipoCurso }),
    ...(query.campaignId !== undefined && { campaignId: query.campaignId }),
    ...(query.inicioDesde !== undefined && { inicioDesde: query.inicioDesde }),
    ...(query.finalHasta !== undefined && { finalHasta: query.finalHasta }),
    limit: query.limit,
    offset: query.offset,
  });
  return json({ contratos });
});

const aprobarSchema = z.object({ classroomId: z.uuid().nullish() });

/** POST /api/contracts/[id]/approve — EL ALTA ÚNICA. Devuelve credenciales (una vez). */
export const aprobarContratoHandler = handlerWithAuth(async (request, auth, context) => {
  const contractId = await contractIdFromContext(context);
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CONTRATOS_GESTIONAR);
  const body = aprobarSchema.parse(await request.json().catch(() => ({})));
  const resultado = await aprobarContrato({
    actorUserId: auth.userId,
    contractId,
    classroomId: body.classroomId ?? null,
    ip: ip(request),
  });
  return json(resultado);
});

const motivoSchema = z.object({ motivo: z.string().min(5).max(300) });

/** POST /api/contracts/[id]/onhold */
export const onholdHandler = handlerWithAuth(async (request, auth, context) => {
  const contractId = await contractIdFromContext(context);
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CONTRATOS_GESTIONAR);
  const body = motivoSchema.parse(await request.json());
  await ponerEnPausa({
    actorUserId: auth.userId,
    contractId,
    motivo: body.motivo,
    ip: ip(request),
  });
  return json({ ok: true });
});

/** POST /api/contracts/[id]/reactivate — extiende final_contrato por los días pausados. */
export const reactivarHandler = handlerWithAuth(async (request, auth, context) => {
  const contractId = await contractIdFromContext(context);
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CONTRATOS_GESTIONAR);
  const resultado = await reactivar({ actorUserId: auth.userId, contractId, ip: ip(request) });
  return json(resultado);
});

/** POST /api/contracts/[id]/deactivate — cascada de inactivación sincronizada. */
export const inactivarHandler = handlerWithAuth(async (request, auth, context) => {
  const contractId = await contractIdFromContext(context);
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CONTRATOS_GESTIONAR);
  const body = motivoSchema.parse(await request.json());
  await inactivarContrato({
    actorUserId: auth.userId,
    contractId,
    motivo: body.motivo,
    ip: ip(request),
  });
  return json({ ok: true });
});
