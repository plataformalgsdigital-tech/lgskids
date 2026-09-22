import { bootstrapIdentity, usuarioRestablecerClaveHandler } from "@/modules/identity";

bootstrapIdentity();

/** POST — genera una clave nueva (se devuelve una vez) y pide cambiarla al entrar. */
export const POST = usuarioRestablecerClaveHandler;
