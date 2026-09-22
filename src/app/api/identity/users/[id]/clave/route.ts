import { bootstrapIdentity, usuarioConsultarClaveHandler } from "@/modules/identity";

bootstrapIdentity();

/** GET — consulta la clave (solo el rol superadmin; queda auditada). */
export const GET = usuarioConsultarClaveHandler;
