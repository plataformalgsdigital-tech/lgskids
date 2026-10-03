import { asistenciaDeNinoHandler } from "@/modules/attendance";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = asistenciaDeNinoHandler;
