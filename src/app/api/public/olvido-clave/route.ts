import { olvidoClaveHandler } from "@/modules/identity";

/**
 * POST — "¿Olvidaste tu clave?" desde el login. Pública (sin sesión, como el
 * login): registra la solicitud para el equipo y responde siempre lo mismo.
 */
export const POST = olvidoClaveHandler;
