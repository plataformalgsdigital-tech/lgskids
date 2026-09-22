import { bootstrapIdentity, solicitudClaveDescartarHandler } from "@/modules/identity";

bootstrapIdentity();

/** POST — descarta la solicitud sin restablecer la clave. */
export const POST = solicitudClaveDescartarHandler;
