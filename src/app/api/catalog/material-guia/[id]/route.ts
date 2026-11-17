import { materialGuiaEditarHandler, materialGuiaEliminarHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const PATCH = materialGuiaEditarHandler;
export const DELETE = materialGuiaEliminarHandler;
