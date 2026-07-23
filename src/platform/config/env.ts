import { z } from "zod";

/**
 * Configuración de entorno, validada con Zod.
 *
 * - La validación es PEREZOSA (primer acceso) para que `next build` no exija
 *   variables que solo existen en runtime.
 * - Nada de leer `process.env` directo fuera de este archivo.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** URL pública de la aplicación (ej. https://lgskidsplataforma.com). */
  APP_URL: z.url().default("http://localhost:3000"),

  /**
   * Conexión con pool para la aplicación. La base administrada de DigitalOcean
   * admite ~22 conexiones: el pool se limita a 8–10 (ver DB_POOL_MAX).
   */
  DATABASE_URL: z.string().min(1).optional(),

  /** Conexión directa (sin pool) SOLO para migraciones. */
  DIRECT_DATABASE_URL: z.string().min(1).optional(),

  /** Máximo de conexiones del pool. Presupuesto documentado: 8–10. */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(10).default(8),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /**
   * Zona operativa por defecto para salones nuevos. Cada salón puede
   * configurar la suya (decisión funcional 2026-07-22).
   */
  OPERATIONAL_TIMEZONE_DEFAULT: z.string().default("America/Santiago"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Devuelve el entorno validado. Lanza si hay valores inválidos. */
export function env(): Env {
  if (cached === null) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}

/** Exige DATABASE_URL en runtime; error claro si falta. */
export function requireDatabaseUrl(): string {
  const url = env().DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL no está configurada. Copia .env.example a .env y levanta PostgreSQL (infra/docker).",
    );
  }
  return url;
}

/** Solo para pruebas: limpia la caché de configuración. */
export function resetEnvCacheForTests(): void {
  cached = null;
}
