import { intentosHandler, registrarIntentoHandler } from "@/modules/assessment";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const POST = registrarIntentoHandler;
export const GET = intentosHandler;
