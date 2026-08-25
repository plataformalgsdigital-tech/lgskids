import { bootstrapIdentity } from "@/modules/identity";
import { crearHorarioHandler, listarHorariosHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const GET = listarHorariosHandler;
export const POST = crearHorarioHandler;
