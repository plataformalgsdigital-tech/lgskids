import { materialGuiaListarHandler, materialGuiaSubirHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = materialGuiaListarHandler;
export const POST = materialGuiaSubirHandler;
