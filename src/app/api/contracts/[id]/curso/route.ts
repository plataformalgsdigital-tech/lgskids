import { cambiarCursoHandler } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

/** Cambio de CURSO (Junior ↔ Youngster) con el salón del curso nuevo. */
export const POST = cambiarCursoHandler;
