import { NotFoundError } from "@/platform/errors";
import { estadoAcademico, type EstadoAcademico } from "../domain/academico";
import { findFilaAcademicaPorRef } from "../infrastructure/contract-repository";

/**
 * "¿Este usuario está tomando el programa?" — la pregunta de LGS.
 *
 * Se responde por el N° de contrato de LGS, que es lo que ellos tienen en la
 * mano (el mismo con el que reservan y aprueban, con su sufijo `#documento`
 * cuando el contrato lleva varios hermanos).
 *
 * Va acompañada del PROGRAMA: sin él, un "inactivo" obliga a abrir el panel
 * para saber si hay que renovar, reactivar o matricular.
 */
export interface FichaAcademica extends EstadoAcademico {
  externalRef: string;
  nino: {
    id: string;
    nombres: string;
    apellidos: string;
    docTipo: string;
    docNumero: string;
    /** Usuario con el que entra a la plataforma; nace al aprobar su contrato. */
    username: string | null;
  };
  contrato: {
    numero: number;
    estado: string;
    tipoCurso: string;
    countryCode: string;
    inicio: string;
    finalContrato: string;
  };
  /** Dónde cursa. null si todavía no tiene salón. */
  programa: {
    campania: string | null;
    salon: string;
    inicioPrograma: string | null;
    matricula: string;
  } | null;
}

export async function fichaAcademicaPorRef(externalRef: string): Promise<FichaAcademica> {
  const fila = await findFilaAcademicaPorRef(externalRef.trim());
  if (fila === null) {
    throw new NotFoundError(`No hay ningún contrato con el N° ${externalRef} en KIDS.`);
  }

  const estado = estadoAcademico({
    contratoEstado: fila.contratoEstado as "PENDIENTE" | "APROBADO" | "ONHOLD" | "INACTIVO",
    vencido: fila.vencido,
    matriculaEstado: fila.matriculaEstado as "ACTIVA" | "RESERVADA" | null,
  });

  return {
    ...estado,
    externalRef: fila.externalRef ?? externalRef,
    nino: {
      id: fila.ninoId,
      nombres: fila.nombres,
      apellidos: fila.apellidos,
      docTipo: fila.docTipo,
      docNumero: fila.docNumero,
      username: fila.username,
    },
    contrato: {
      numero: fila.numero,
      estado: fila.contratoEstado,
      tipoCurso: fila.tipoCurso,
      countryCode: fila.countryCode,
      inicio: fila.inicio,
      finalContrato: fila.finalContrato,
    },
    programa:
      fila.salon === null || fila.matriculaEstado === null
        ? null
        : {
            campania: fila.campania,
            salon: fila.salon,
            inicioPrograma: fila.cursoInicio,
            matricula: fila.matriculaEstado,
          },
  };
}
