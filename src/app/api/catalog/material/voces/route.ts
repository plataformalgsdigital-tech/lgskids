import { vocesLibroAccionHandler, vocesLibroEstadoHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = vocesLibroEstadoHandler;
export const POST = vocesLibroAccionHandler;
