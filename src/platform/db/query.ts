import type { PoolClient, QueryResultRow } from "pg";
import { getPool } from "./pool";

/**
 * Helpers de consulta parametrizada.
 *
 * SIEMPRE parámetros posicionales ($1, $2…). Interpolar valores en el SQL es
 * una violación de seguridad. Las consultas críticas de rendimiento viven en
 * la capa infrastructure de cada módulo usando estos helpers.
 */

type Queryable = Pick<PoolClient, "query">;

function runner(client?: Queryable): Queryable {
  return client ?? getPool();
}

/** Todas las filas. */
export async function queryRows<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client?: Queryable,
): Promise<T[]> {
  const result = await runner(client).query<T>(sql, params);
  return result.rows;
}

/** Primera fila o null. */
export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client?: Queryable,
): Promise<T | null> {
  const rows = await queryRows<T>(sql, params, client);
  return rows[0] ?? null;
}

/** Ejecuta sin filas de interés; devuelve el número de filas afectadas. */
export async function execute(
  sql: string,
  params: unknown[] = [],
  client?: Queryable,
): Promise<number> {
  const result = await runner(client).query(sql, params);
  return result.rowCount ?? 0;
}
