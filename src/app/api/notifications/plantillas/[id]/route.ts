import { bootstrapIdentity } from "@/modules/identity";
import { plantillaActualizarHandler } from "@/modules/notifications";

bootstrapIdentity();

export const PATCH = plantillaActualizarHandler;
