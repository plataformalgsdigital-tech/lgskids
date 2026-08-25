import { bootstrapIdentity } from "@/modules/identity";
import { crearCampaniaHandler, listarCampaniasHandler } from "@/modules/catalog";

bootstrapIdentity();

export const POST = crearCampaniaHandler;
export const GET = listarCampaniasHandler;
