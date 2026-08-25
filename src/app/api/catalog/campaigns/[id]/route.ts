import { actualizarCampaniaHandler, detalleCampaniaHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = detalleCampaniaHandler;
export const PATCH = actualizarCampaniaHandler;
