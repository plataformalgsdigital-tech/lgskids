import {
  bootstrapIdentity,
  enlaceClaveFichaHandler,
  enlaceClaveUsarHandler,
} from "@/modules/identity";

bootstrapIdentity();

/** GET ?token= — qué cuenta abre el enlace de "¿Olvidaste tu clave?". Pública. */
export const GET = enlaceClaveFichaHandler;

/** POST { token, clave, confirmacion } — fija la clave nueva. Pública. */
export const POST = enlaceClaveUsarHandler;
