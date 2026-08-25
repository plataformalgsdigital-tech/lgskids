import { referenciaLeccionGetHandler, referenciaLeccionPutHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = referenciaLeccionGetHandler;
export const PUT = referenciaLeccionPutHandler;
