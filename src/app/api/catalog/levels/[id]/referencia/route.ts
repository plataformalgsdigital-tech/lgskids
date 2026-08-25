import { referenciaNivelGetHandler, referenciaNivelPutHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = referenciaNivelGetHandler;
export const PUT = referenciaNivelPutHandler;
