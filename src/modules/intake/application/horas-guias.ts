import { ValidationError } from "@/platform/errors";
import { listarSesionesGuias, type SesionGuiaRow } from "../infrastructure/horas-guias-repository";

export type SesionGuia = SesionGuiaRow;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 62;

/**
 * Sesiones ya ocurridas entre `desde` y `hasta` (fecha operativa del salón, ambos
 * inclusive) con su guía y los inscritos / presentes por país del contrato del
 * niño. Lo consume la liquidación de horas de guías de LGS. Solo lectura.
 */
export async function horasGuias(
  desde: string,
  hasta: string,
): Promise<{ sesiones: SesionGuia[] }> {
  if (!ISO_DATE.test(desde) || !ISO_DATE.test(hasta) || desde > hasta) {
    throw new ValidationError("Rango inválido: desde y hasta en AAAA-MM-DD, desde ≤ hasta.");
  }
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  if (dias > MAX_DIAS) throw new ValidationError(`Rango máximo de ${MAX_DIAS} días.`);
  return { sesiones: await listarSesionesGuias(desde, hasta) };
}
