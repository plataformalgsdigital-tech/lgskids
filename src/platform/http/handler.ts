import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { env } from "../config/env";
import { isAppError, UnauthorizedError } from "../errors";
import { newId } from "../ids";
import { logger, withCorrelationId } from "../logging/logger";

/**
 * Envoltorios estándar para rutas API de Next.js.
 *
 * - `handler()`: correlation ID + traducción de errores a HTTP. Nunca filtra
 *   detalles internos al cliente.
 * - `handlerWithAuth()`: además exige autenticación. La verificación real la
 *   registra el módulo `identity` en el arranque (registerAuthenticator);
 *   `platform/` no contiene reglas de negocio (regla 3.4.5).
 *
 * REGLA DE SEGURIDAD (sección 7): la autorización se hace en el SERVIDOR,
 * endpoint por endpoint. No existe "middleware que ya me cubre".
 */

export interface AuthContext {
  userId: string;
  roles: string[];
  /** Países visibles para el usuario; null = alcance global. */
  countryScope: string[] | null;
}

export interface Authenticator {
  /** Valida la request y devuelve el contexto; lanza UnauthorizedError si no. */
  authenticate(request: NextRequest): Promise<AuthContext>;
}

let authenticator: Authenticator | null = null;

/** Lo invoca el módulo `identity` al arrancar la aplicación. */
export function registerAuthenticator(impl: Authenticator): void {
  authenticator = impl;
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

type Handler = (request: NextRequest, context: RouteContext) => Promise<NextResponse>;

type AuthedHandler = (
  request: NextRequest,
  auth: AuthContext,
  context: RouteContext,
) => Promise<NextResponse>;

/** Respuesta JSON estándar. */
export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

function errorResponse(error: unknown, correlationId: string): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "La entrada no es válida.",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
          correlationId,
        },
      },
      { status: 400, headers: { "x-correlation-id": correlationId } },
    );
  }

  if (isAppError(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined && { details: error.details }),
          correlationId,
        },
      },
      { status: error.status, headers: { "x-correlation-id": correlationId } },
    );
  }

  // Error no controlado: log completo en servidor, mensaje genérico al cliente.
  logger.error("Error no controlado en handler", {
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Ocurrió un error interno. Intenta nuevamente.",
        correlationId,
      },
    },
    { status: 500, headers: { "x-correlation-id": correlationId } },
  );
}

/** Handler público (sin autenticación). */
export function handler(fn: Handler): Handler {
  return async (request, context) => {
    const correlationId = request.headers.get("x-correlation-id") ?? newId();
    return withCorrelationId(correlationId, async () => {
      try {
        const response = await fn(request, context);
        response.headers.set("x-correlation-id", correlationId);
        return response;
      } catch (error) {
        return errorResponse(error, correlationId);
      }
    });
  };
}

/** Handler autenticado. 401 si no hay autenticador registrado o falla la validación. */
export function handlerWithAuth(fn: AuthedHandler): Handler {
  return handler(async (request, context) => {
    if (authenticator === null) {
      throw new UnauthorizedError("Autenticación no disponible.");
    }
    const auth = await authenticator.authenticate(request);
    return fn(request, auth, context);
  });
}

/** Comparación de secretos en tiempo constante (evita timing attacks). */
function claveIgual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Handler de SERVICIO (máquina-a-máquina): valida el header `x-api-key` contra
 * `LGS_INTAKE_API_KEY`. Es una puerta DISTINTA de `handlerWithAuth` (usuario
 * final): aquí no hay `userId`; el principal es el servicio LGS. Si la clave no
 * está configurada, la puerta queda CERRADA (401).
 */
export function handlerWithServiceAuth(fn: Handler): Handler {
  return handler(async (request, context) => {
    const esperada = env().LGS_INTAKE_API_KEY;
    const recibida = request.headers.get("x-api-key");
    if (!esperada || !recibida || !claveIgual(recibida, esperada)) {
      throw new UnauthorizedError("Clave de servicio inválida.");
    }
    return fn(request, context);
  });
}
