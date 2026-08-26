import { hotspotsGuardarHandler, hotspotsInfoHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = hotspotsInfoHandler;
export const PUT = hotspotsGuardarHandler;
