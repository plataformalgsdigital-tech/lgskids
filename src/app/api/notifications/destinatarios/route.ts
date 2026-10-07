import { bootstrapIdentity } from "@/modules/identity";
import { destinatariosHandler } from "@/modules/notifications";

bootstrapIdentity();

export const POST = destinatariosHandler;
