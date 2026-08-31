import { avisoLoginActivarHandler, avisoLoginEstadoHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = avisoLoginEstadoHandler;
export const PATCH = avisoLoginActivarHandler;
