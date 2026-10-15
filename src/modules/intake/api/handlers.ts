import { z } from "zod";
import {
  aprobarReservaPorExternalRef,
  crearReservaBeneficiario,
  extenderPorExternalRef,
  fichaAcademicaPorRef,
  finPausaPorExternalRef,
  pausarPorExternalRef,
  reactivarPorExternalRef,
  suspenderPorExternalRef,
} from "@/modules/contracts";
import { handlerWithServiceAuth, json } from "@/platform/http/handler";
import { disponibilidad } from "../application/disponibilidad";
import { roster } from "../application/roster";

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

/**
 * GET /api/kids-intake/availability — campañas abiertas + salones con cupo.
 * `?incluirLlenos=1` agrega los salones sin cupo (`lleno: true`) y
 * `?incluirInactivos=1` los inactivos (`activo: false`) — los usa la consulta
 * "Cursos Kids" de LGS; el modal de inscripción no los envía.
 */
export const disponibilidadHandler = handlerWithServiceAuth(async (request) => {
  const params = new URL(request.url).searchParams;
  return json(
    await disponibilidad({
      incluirLlenos: params.get("incluirLlenos") === "1",
      incluirInactivos: params.get("incluirInactivos") === "1",
    }),
  );
});

/**
 * GET /api/kids-intake/roster — todas las campañas, cursos y salones con las
 * matrículas de cada salón (contrato, niño, apoderado). Solo lectura; lo usa la
 * consulta "Aprobación › Kids" de LGS.
 */
export const rosterIntakeHandler = handlerWithServiceAuth(async () => json(await roster()));

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

/**
 * GET /api/kids-intake/reservations/[externalRef] — ¿está tomando el programa?
 *
 * La respuesta es DERIVADA (contrato + vigencia + matrícula), nunca una
 * columna guardada: una bandera escrita a mano seguiría diciendo ACTIVO con el
 * contrato ya vencido. Trae el motivo y el programa porque un "inactivo" a
 * secas obliga a LGS a abrir el panel para saber qué hacer.
 */
export const estadoAcademicoIntakeHandler = handlerWithServiceAuth(async (_request, context) => {
  const params = await context.params;
  const externalRef = z.string().min(1).max(60).parse(params["externalRef"]);
  return json(await fichaAcademicaPorRef(externalRef));
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

/**
 * POST /api/kids-intake/reservations/[externalRef]/suspend — el beneficiario se
 * INACTIVÓ en LGS: pausa el contrato (SUSPENDIDO) y bloquea el login del niño.
 * Body opcional { motivo }. Idempotente (`aplicado: false` si no aplica).
 */
export const suspenderIntakeHandler = handlerWithServiceAuth(async (request, context) => {
  const params = await context.params;
  const externalRef = z.string().min(1).max(60).parse(params["externalRef"]);
  const body = z
    .object({ motivo: z.string().max(400).optional() })
    .parse(await request.json().catch(() => ({})));
  return json(
    await suspenderPorExternalRef({
      actorUserId: SYSTEM_ACTOR,
      externalRef,
      motivo: body.motivo ?? "",
      ip: ip(request),
    }),
  );
});

/**
 * POST /api/kids-intake/reservations/[externalRef]/onhold — OnHold abierto en
 * LGS: la misma pausa aquí (inicio, fin programado, motivo; bloquea el login).
 * Body { desde, hasta, motivo, activadoPor? }. Idempotente (`aplicado: false`
 * si el contrato no está APROBADO). Rechaza (4xx) si rompe una regla — LGS
 * entonces no pausa.
 */
export const pausarIntakeHandler = handlerWithServiceAuth(async (request, context) => {
  const params = await context.params;
  const externalRef = z.string().min(1).max(60).parse(params["externalRef"]);
  const body = z
    .object({
      desde: z.string().regex(ISO_DATE),
      hasta: z.string().regex(ISO_DATE),
      motivo: z.string().max(400).default(""),
      activadoPor: z.string().max(120).nullish(),
    })
    .parse(await request.json());
  return json(
    await pausarPorExternalRef({
      actorUserId: SYSTEM_ACTOR,
      externalRef,
      desde: body.desde,
      hasta: body.hasta,
      motivo: body.motivo,
      activadoPor: body.activadoPor ?? null,
      ip: ip(request),
    }),
  );
});

/**
 * POST /api/kids-intake/reservations/[externalRef]/onhold/end — fin del OnHold
 * en LGS: cierra la pausa extendiendo el fin con los MISMOS días que LGS.
 * Body { dias }. Idempotente (`aplicado: false` sin pausa OnHold abierta).
 */
export const finPausaIntakeHandler = handlerWithServiceAuth(async (request, context) => {
  const params = await context.params;
  const externalRef = z.string().min(1).max(60).parse(params["externalRef"]);
  const body = z.object({ dias: z.number().int().min(0).max(3650) }).parse(await request.json());
  return json(
    await finPausaPorExternalRef({
      actorUserId: SYSTEM_ACTOR,
      externalRef,
      dias: body.dias,
      ip: ip(request),
    }),
  );
});

/**
 * POST /api/kids-intake/reservations/[externalRef]/extend — extensión manual de
 * vigencia hecha en LGS: corre el fin con los MISMOS días (y reactiva al niño si
 * estaba fuera, como LGS). Body { dias, motivo?, ejecutadoPor? }.
 */
export const extenderIntakeHandler = handlerWithServiceAuth(async (request, context) => {
  const params = await context.params;
  const externalRef = z.string().min(1).max(60).parse(params["externalRef"]);
  const body = z
    .object({
      dias: z.number().int().min(1).max(3650),
      motivo: z.string().max(400).default(""),
      ejecutadoPor: z.string().max(120).nullish(),
    })
    .parse(await request.json());
  return json(
    await extenderPorExternalRef({
      actorUserId: SYSTEM_ACTOR,
      externalRef,
      dias: body.dias,
      motivo: body.motivo,
      ejecutadoPor: body.ejecutadoPor ?? null,
      ip: ip(request),
    }),
  );
});

/**
 * POST /api/kids-intake/reservations/[externalRef]/reactivate — el beneficiario
 * se REACTIVÓ en LGS: cierra la pausa que abrió LGS (sin extender el fin) y
 * reactiva el login. Una pausa abierta en KIDS no se toca.
 */
export const reactivarIntakeHandler = handlerWithServiceAuth(async (request, context) => {
  const params = await context.params;
  const externalRef = z.string().min(1).max(60).parse(params["externalRef"]);
  return json(
    await reactivarPorExternalRef({ actorUserId: SYSTEM_ACTOR, externalRef, ip: ip(request) }),
  );
});
