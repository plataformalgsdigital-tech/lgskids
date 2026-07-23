import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "../config/env";

/**
 * Logs estructurados en JSON con correlation ID.
 *
 * El correlation ID se propaga con AsyncLocalStorage: `platform/http` abre el
 * contexto por request y todo log emitido dentro lo incluye automáticamente.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

interface LogContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Ejecuta `fn` con un correlation ID activo (usado por platform/http). */
export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

/** Correlation ID del contexto actual, si existe. */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

function emit(level: Level, message: string, extra?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[env().LOG_LEVEL]) {
    return;
  }
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    message,
    ...(currentCorrelationId() !== undefined && { correlationId: currentCorrelationId() }),
    ...extra,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) => emit("debug", message, extra),
  info: (message: string, extra?: Record<string, unknown>) => emit("info", message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => emit("warn", message, extra),
  error: (message: string, extra?: Record<string, unknown>) => emit("error", message, extra),
};
