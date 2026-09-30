import { estadoAcademicoIntakeHandler } from "@/modules/intake";

/**
 * Estado ACADÉMICO del niño por el N° de contrato de LGS: si está tomando el
 * programa o no, y por qué. Derivado de contrato + vigencia + matrícula, nunca
 * de una columna guardada.
 */
export const GET = estadoAcademicoIntakeHandler;
