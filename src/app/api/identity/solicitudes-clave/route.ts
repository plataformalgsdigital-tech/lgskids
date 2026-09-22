import { bootstrapIdentity, solicitudesClaveListarHandler } from "@/modules/identity";

bootstrapIdentity();

/** GET — solicitudes de "olvidé mi clave" pendientes. */
export const GET = solicitudesClaveListarHandler;
