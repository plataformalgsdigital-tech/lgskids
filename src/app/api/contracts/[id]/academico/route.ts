import { opcionesAcademicasHandler } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = opcionesAcademicasHandler;
