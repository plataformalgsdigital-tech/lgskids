import { cursoReferenciaValidarHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const POST = cursoReferenciaValidarHandler;
