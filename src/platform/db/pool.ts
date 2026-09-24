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

/**
 * Quita `sslmode` de la URL cuando hay certificado.
 *
 * `pg` da PRIORIDAD al `sslmode` de la cadena de conexión sobre el objeto
 * `ssl`, y desde 8.22 lo interpreta como `verify-full` contra el almacén del
 * sistema: con la CA en la mano, la conexión fallaba igual con "self-signed
 * certificate in certificate chain". Quitándolo manda la verificación contra
 * la CA, que es la que firma esa base. Sin certificado no se toca nada.
 */
export function conCertificado(url: string, ca: string | undefined): string {
  if (ca === undefined) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url;
  }
}

export function getPool(): Pool {
  if (pool === null) {
    // Con la CA de la base administrada se verifica la cadena completa.
    const ca = env().DATABASE_CA_CERT;
    pool = new Pool({
      connectionString: conCertificado(requireDatabaseUrl(), ca),
      ...(ca === undefined ? {} : { ssl: { ca, rejectUnauthorized: true } }),
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
