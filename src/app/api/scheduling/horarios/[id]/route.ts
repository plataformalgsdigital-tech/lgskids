import {
  actualizarHorarioHandler,
  eliminarHorarioHandler,
  toggleHorarioHandler,
} from "@/modules/scheduling";

export const PUT = actualizarHorarioHandler;
export const PATCH = toggleHorarioHandler;
export const DELETE = eliminarHorarioHandler;
