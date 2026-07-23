import { checkDatabase } from "@/platform/db/pool";
import { env } from "@/platform/config/env";
import { handler, json } from "@/platform/http/handler";

/**
 * Readiness: ¿puede atender tráfico? Verifica la base de datos.
 * 503 si la base no responde (el balanceador deja de enrutar aquí).
 */
export const GET = handler(async () => {
  if (!env().DATABASE_URL) {
    return json({ status: "degraded", database: "not-configured" }, { status: 503 });
  }
  const databaseOk = await checkDatabase();
  if (!databaseOk) {
    return json({ status: "unavailable", database: "down" }, { status: 503 });
  }
  return json({ status: "ok", database: "up" });
});
