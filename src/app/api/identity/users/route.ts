import { bootstrapIdentity, usuarioCrearHandler, usuariosListarHandler } from "@/modules/identity";

bootstrapIdentity();

/** POST — crea un usuario de staff (usuario y clave generados, se muestran una vez). */
export const POST = usuarioCrearHandler;
/** GET ?buscar= — usuarios con sus roles. */
export const GET = usuariosListarHandler;
