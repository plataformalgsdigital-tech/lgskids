import {
  actualizarCampaniaHandler,
  detalleCampaniaHandler,
  eliminarCampaniaHandler,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = detalleCampaniaHandler;
export const PATCH = actualizarCampaniaHandler;
/** Borra la campaña con sus cursos y salones. Se bloquea si hay matrículas. */
export const DELETE = eliminarCampaniaHandler;
