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

  /** Secreto de firma de JWT (mínimo 32 caracteres). Requerido en runtime. */
  AUTH_JWT_SECRET: z.string().min(32).optional(),

  /** Vida del access token en segundos (default 15 minutos). */
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

  /** Vida del refresh token en días (default 30). */
  AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  /** "1" activa las pruebas de integración contra base real (CI). */
  INTEGRATION_TESTS: z.string().optional(),

  /** WhatsApp Cloud API (Fase 11). Sin credenciales se usa LogSender. */
  WHATSAPP_TOKEN: z.string().min(10).optional(),
  WHATSAPP_PHONE_ID: z.string().min(3).optional(),

  /**
   * Clave de servicio para el intake desde LGS (Fase B). Si está ausente, la
   * puerta de servicio queda CERRADA (todo 401). Mínimo 16 caracteres.
   */
  LGS_INTAKE_API_KEY: z.string().min(16).optional(),

  /** Carpeta del adaptador local de archivos (desarrollo). */
  STORAGE_DIR: z.string().default(".storage"),

  /** Solo para el seed: credenciales del admin inicial. */
  SEED_ADMIN_USERNAME: z.string().min(3).default("admin"),
  SEED_ADMIN_PASSWORD: z.string().min(10).optional(),

  /** Solo para el seed: SuperAdmin (llave maestra, alcance total). */
  SEED_SUPERADMIN_USERNAME: z.string().min(3).default("superadmin"),
  SEED_SUPERADMIN_PASSWORD: z.string().min(10).optional(),

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

/** Exige AUTH_JWT_SECRET en runtime; error claro si falta. */
export function requireAuthSecret(): string {
  const secret = env().AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_JWT_SECRET no está configurada (mínimo 32 caracteres). Ver .env.example.",
    );
  }
  return secret;
}

/** Solo para pruebas: limpia la caché de configuración. */
export function resetEnvCacheForTests(): void {
  cached = null;
}
