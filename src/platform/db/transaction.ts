import type { PoolClient } from "pg";
import { getPool } from "./pool";

/**
 * Ejecuta `fn` dentro de una transacción. COMMIT si resuelve, ROLLBACK si lanza.
 *
 * Obligatoria en toda operación que toque más de una tabla: creación de
 * alumno, cambio académico, ajuste de cupos, regeneración de sesiones.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // El error original es el relevante; el fallo del ROLLBACK no lo tapa.
    }
    throw error;
  } finally {
    client.release();
  }
}
