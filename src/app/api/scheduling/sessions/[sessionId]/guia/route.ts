import { bootstrapIdentity } from "@/modules/identity";
import { cambiarGuiaSesionHandler } from "@/modules/scheduling";

bootstrapIdentity();

/**
 * Guía de UNA sesión: el reemplazo de un día. No toca el salón ni las demás
 * sesiones — para cambiar el guía del curso está el detalle del salón.
 */
export const POST = cambiarGuiaSesionHandler;
