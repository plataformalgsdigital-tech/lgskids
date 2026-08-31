import { listaDeSesionHandler, marcarAsistenciaHandler } from "@/modules/attendance";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = listaDeSesionHandler;
export const POST = marcarAsistenciaHandler;
