import { buscarEstudiantesHandler } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

/** GET — el niño con sus contratos y su cuenta (tarjeta Estudiante). */
export const GET = buscarEstudiantesHandler;
