import { bootstrapIdentity } from "@/modules/identity";
import { olvidoClaveHandler } from "@/modules/notifications";

bootstrapIdentity();

/**
 * POST — "¿Olvidaste tu clave?" desde el login. Pública (sin sesión, como el
 * login): registra la solicitud para el equipo, manda por WhatsApp un enlace
 * para elegir clave nueva al teléfono registrado y responde siempre lo mismo.
 */
export const POST = olvidoClaveHandler;
