import { bootstrapIdentity } from "@/modules/identity";
import { impactoFinProgramaHandler, moverFinProgramaHandler } from "@/modules/scheduling";

bootstrapIdentity();

/**
 * Fin del programa de una campaña. El GET es el PREVIO (qué pasaría) y el POST
 * lo aplica: reescribe el fin nominal de sus cursos y regenera las sesiones de
 * todos sus salones. Se bloquea si ya hay asistencia o sesiones cerradas.
 */
export const GET = impactoFinProgramaHandler;
export const POST = moverFinProgramaHandler;
