import { bootstrapIdentity } from "@/modules/identity";
import { plantillaCrearHandler, plantillasListarHandler } from "@/modules/notifications";

bootstrapIdentity();

export const GET = plantillasListarHandler;
export const POST = plantillaCrearHandler;
