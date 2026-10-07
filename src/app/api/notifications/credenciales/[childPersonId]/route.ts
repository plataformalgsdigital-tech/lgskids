import { bootstrapIdentity } from "@/modules/identity";
import { credencialesEnviarHandler, credencialesVistaHandler } from "@/modules/notifications";

bootstrapIdentity();

export const GET = credencialesVistaHandler;
export const POST = credencialesEnviarHandler;
