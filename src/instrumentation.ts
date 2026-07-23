/**
 * Instrumentación de Next.js: corre UNA vez al arrancar el servidor.
 * Registra el autenticador real de identity en platform/http.
 *
 * El guard NEXT_RUNTIME es el patrón oficial: evita que el bundle de Edge
 * intente compilar dependencias nativas (argon2, pg, node:crypto).
 */
export async function register(): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax -- guard de runtime exigido por Next, resuelto en compilación
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapIdentity } = await import("@/modules/identity");
    bootstrapIdentity();
  }
}
