import { handler, json } from "@/platform/http/handler";

/**
 * Liveness: ¿el proceso responde? NO toca la base de datos — un problema de
 * base no debe reiniciar el contenedor.
 */
export const GET = handler(async () => json({ status: "ok" }));
