import { Pool } from "pg";
import { env, requireDatabaseUrl } from "../config/env";
import { logger } from "../logging/logger";

/**
 * Pool único de conexiones a PostgreSQL.
 *
 * Presupuesto de conexiones (ADR-0004): la base administrada admite ~22;
 * el pool se limita a DB_POOL_MAX (default 8) para dejar espacio al worker,
 * a las migraciones y a conexiones administrativas. En LGS un pool mal
 * dimensionado agotó la base — no subir este límite sin revisar el total.
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool === null) {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      max: env().DB_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (error) => {
      logger.error("Error en conexión ociosa del pool", { error: String(error) });
    });
  }
  return pool;
}

/** Cierre controlado (apagado del proceso). */
export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}

/** ¿Responde la base? Usado por /health/ready. Nunca lanza. */
export async function checkDatabase(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch (error) {
    logger.warn("checkDatabase falló", { error: String(error) });
    return false;
  }
}
