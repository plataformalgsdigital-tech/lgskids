import { crearNinoHandler, listarNinosHandler } from "@/modules/people";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = listarNinosHandler;
export const POST = crearNinoHandler;
