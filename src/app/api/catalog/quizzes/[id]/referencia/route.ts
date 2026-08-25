import { referenciaQuizGetHandler, referenciaQuizPutHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = referenciaQuizGetHandler;
export const PUT = referenciaQuizPutHandler;
