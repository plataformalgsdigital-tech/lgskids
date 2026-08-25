import { bootstrapIdentity } from "@/modules/identity";
import {
  actualizarHorarioHandler,
  eliminarHorarioHandler,
  toggleHorarioHandler,
} from "@/modules/scheduling";

bootstrapIdentity();

export const PUT = actualizarHorarioHandler;
export const PATCH = toggleHorarioHandler;
export const DELETE = eliminarHorarioHandler;
