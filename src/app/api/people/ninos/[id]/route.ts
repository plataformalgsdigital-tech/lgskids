import { detalleNinoHandler } from "@/modules/people";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = detalleNinoHandler;
