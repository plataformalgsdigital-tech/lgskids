import { intervencionEditarHandler, intervencionEliminarHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const PATCH = intervencionEditarHandler;
export const DELETE = intervencionEliminarHandler;
