import { cursoReferenciaCrearHandler, cursoReferenciaListHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = cursoReferenciaListHandler;
export const POST = cursoReferenciaCrearHandler;
