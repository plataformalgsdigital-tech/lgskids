import { bootstrapIdentity } from "@/modules/identity";
import { detalleSalonHandler, editarSalonHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const GET = detalleSalonHandler;
export const PATCH = editarSalonHandler;
