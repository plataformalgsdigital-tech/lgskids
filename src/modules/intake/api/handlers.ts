import { z } from "zod";
import { aprobarReservaPorExternalRef, crearReservaBeneficiario } from "@/modules/contracts";
import { handlerWithServiceAuth, json } from "@/platform/http/handler";
import { disponibilidad } from "../application/disponibilidad";

/** Usuario de sistema (migración 20260819000003) — actor de auditoría del intake. */
const SYSTEM_ACTOR = "11111111-1111-4111-8111-111111111111";

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
  // `finalContrato` YA NO se recibe (2026-09-21): el fin es inicio + 12 meses y
  // lo calcula KIDS. Si LGS lo sigue mandando, Zod lo descarta sin error.
  classroomId: z.uuid(),
  titular: personaSchema,
  titularEsApoderado: z.boolean().optional(),
  apoderadoNuevo: personaSchema.optional(),
  nino: personaSchema.extend({ fechaNacimiento: z.string().regex(ISO_DATE) }),
  parentesco: z.string().max(40).nullish(),
});

function ip(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** GET /api/kids-intake/availability — campañas abiertas + salones con cupo. */
export const disponibilidadHandler = handlerWithServiceAuth(async () => {
  return json(await disponibilidad());
});

/** POST /api/kids-intake/reservations — crea la reserva del beneficiario. */
export const reservarIntakeHandler = handlerWithServiceAuth(async (request) => {
  const body = reservaSchema.parse(await request.json());
  const resultado = await crearReservaBeneficiario({
    actorUserId: SYSTEM_ACTOR,
    ...body,
    ip: ip(request),
  });
  return json(resultado, { status: 201 });
});

/** POST /api/kids-intake/reservations/[externalRef]/approve — activa la reserva. */
export const aprobarIntakeHandler = handlerWithServiceAuth(async (request, context) => {
  const params = await context.params;
  const externalRef = z.string().min(1).max(60).parse(params["externalRef"]);
  const resultado = await aprobarReservaPorExternalRef({
    actorUserId: SYSTEM_ACTOR,
    externalRef,
    ip: ip(request),
  });
  return json(resultado);
});
