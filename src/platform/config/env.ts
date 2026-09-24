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

  /**
   * Certificado (PEM) de la CA de la base administrada.
   *
   * La base de DigitalOcean obliga a TLS y la firma su PROPIA autoridad, que
   * no está en el almacén del sistema. Desde pg 8.22, `sslmode=require` en la
   * URL se verifica como `verify-full`, así que sin este certificado la
   * conexión falla con "self-signed certificate in certificate chain".
   * Con él se verifica de verdad, que es mejor que apagar la comprobación.
   * Ausente (desarrollo, CI): conexión sin TLS al Postgres local.
   */
  DATABASE_CA_CERT: z.string().min(40).optional(),

  /** Máximo de conexiones del pool. Presupuesto documentado: 8–10. */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(10).default(8),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /** Secreto de firma de JWT (mínimo 32 caracteres). Requerido en runtime. */
  AUTH_JWT_SECRET: z.string().min(32).optional(),

  /** Vida del access token en segundos (default 15 minutos). */
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

  /** Vida del refresh token en días (default 30). */
  AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  /**
   * Llave de la BÓVEDA DE CLAVES: 32 bytes en base64. Con ella se guarda,
   * además del hash, una copia CIFRADA (AES-256-GCM) de cada contraseña para
   * que el superadmin pueda consultarla (decisión del negocio, 2026-09-21).
   * Es distinta de AUTH_JWT_SECRET a propósito: rotar una no toca la otra, y
   * vive fuera de la base, así que robar la base no basta para leer claves.
   * Sin ella no se guarda ninguna copia y la consulta queda apagada.
   */
  PASSWORD_VAULT_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "PASSWORD_VAULT_KEY debe ser 32 bytes en base64.",
    })
    .optional(),

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

  /**
   * DigitalOcean Spaces (S3): el almacenamiento de PRODUCCIÓN.
   *
   * El contenedor de App Platform tiene disco EFÍMERO: lo que se sube al disco
   * local desaparece en el siguiente despliegue, y ahí viven los libros, los
   * videos, el arte y las fotos. Con las cuatro variables puestas,
   * `getStorage()` usa Spaces; sin ellas, la carpeta local (desarrollo y CI).
   * Van las cuatro o ninguna: media configuración guardaría en el sitio
   * equivocado sin avisar.
   */
  SPACES_KEY: z.string().min(8).optional(),
  SPACES_SECRET: z.string().min(8).optional(),
  SPACES_BUCKET: z.string().min(3).optional(),
  SPACES_REGION: z.string().min(3).optional(),
  /** Por defecto `https://<region>.digitaloceanspaces.com`. */
  SPACES_ENDPOINT: z.url().optional(),

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

export interface ConfigSpaces {
  key: string;
  secret: string;
  bucket: string;
  region: string;
  endpoint: string;
}

/**
 * Arma la configuración de Spaces: TODO o NADA.
 *
 * Con alguna de las cuatro puesta y otra faltando, lanza. Un despliegue con la
 * llave pero sin bucket arrancaría guardando en el disco efímero del
 * contenedor, y eso solo se descubre cuando los archivos ya se perdieron.
 * Pura, para poder probarla sin tocar el entorno.
 */
export function armarConfigSpaces(partes: {
  SPACES_KEY?: string | undefined;
  SPACES_SECRET?: string | undefined;
  SPACES_BUCKET?: string | undefined;
  SPACES_REGION?: string | undefined;
  SPACES_ENDPOINT?: string | undefined;
}): ConfigSpaces | null {
  const obligatorias = ["SPACES_KEY", "SPACES_SECRET", "SPACES_BUCKET", "SPACES_REGION"] as const;
  const faltan = obligatorias.filter((k) => partes[k] === undefined);
  if (faltan.length === obligatorias.length) return null;
  if (faltan.length > 0) {
    throw new Error(`Spaces a medio configurar: falta ${faltan.join(", ")}.`);
  }
  const region = partes.SPACES_REGION ?? "";
  return {
    key: partes.SPACES_KEY ?? "",
    secret: partes.SPACES_SECRET ?? "",
    bucket: partes.SPACES_BUCKET ?? "",
    region,
    endpoint: partes.SPACES_ENDPOINT ?? `https://${region}.digitaloceanspaces.com`,
  };
}

/** Credenciales de Spaces del entorno, o null si no está configurado. */
export function configuracionSpaces(): ConfigSpaces | null {
  return armarConfigSpaces(env());
}

/** Llave de la bóveda de claves, o null si no está configurada (función apagada). */
export function llaveBovedaClaves(): Buffer | null {
  const v = env().PASSWORD_VAULT_KEY;
  return v === undefined ? null : Buffer.from(v, "base64");
}

/** Solo para pruebas: limpia la caché de configuración. */
export function resetEnvCacheForTests(): void {
  cached = null;
}
