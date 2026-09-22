/**
 * Jerarquía de errores de la plataforma.
 *
 * Los módulos lanzan estos errores; `platform/http` los traduce a respuestas
 * HTTP estándar. Ningún error de esta jerarquía debe filtrar detalles internos
 * (SQL, stack traces) al cliente.
 */

export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  readonly details: unknown;

  constructor(message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.details = options?.details;
  }
}

/** 400 — La entrada no cumple el esquema o una regla de formato. */
export class ValidationError extends AppError {
  override readonly status = 400;
  override readonly code = "VALIDATION_ERROR";
}

/** 401 — Sin credenciales válidas. */
export class UnauthorizedError extends AppError {
  override readonly status = 401;
  override readonly code = "UNAUTHORIZED";
}

/** 403 — Credenciales válidas pero sin permiso (RBAC / alcance por país). */
export class ForbiddenError extends AppError {
  override readonly status = 403;
  override readonly code = "FORBIDDEN";
}

/**
 * 403 — La sesión es válida, pero la cuenta tiene pendiente cambiar la clave.
 * Código propio para que el cliente sepa a dónde mandar al usuario en vez de
 * mostrar "sin permiso".
 */
export class DebeCambiarPasswordError extends AppError {
  override readonly status = 403;
  override readonly code = "DEBE_CAMBIAR_PASSWORD";
}

/** 404 — El recurso no existe o no es visible para el solicitante. */
export class NotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = "NOT_FOUND";
}

/** 409 — Conflicto con el estado actual (cupo lleno, duplicado, estado inválido). */
export class ConflictError extends AppError {
  override readonly status = 409;
  override readonly code = "CONFLICT";
}

/** 429 — Demasiados intentos (rate limiting). */
export class TooManyRequestsError extends AppError {
  override readonly status = 429;
  override readonly code = "TOO_MANY_REQUESTS";
}

/** ¿Es un error controlado de la aplicación? */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
