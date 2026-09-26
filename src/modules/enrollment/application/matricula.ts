import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  activarReserva,
  cerrarEnrollment,
  countActivas,
  findActivaByContract,
  findEnrollmentById,
  findMatriculaVivaByContract,
  findReservadaByContract,
  getContractData,
  historialPorNino,
  insertEnrollment,
  lockClassroom,
  matriculaActualDeNino,
  rosterSalon,
  type EnrollmentHistoryItem,
  type MatriculaActual,
  type RosterItem,
} from "../infrastructure/enrollment-repository";

type Queryable = Pick<PoolClient, "query">;

/**
 * NÚCLEO TRANSACCIONAL de la matrícula — lo comparten TODOS los caminos
 * (matricular directo, aprobar contrato, cambio académico). Regla dura 5:
 * un solo lugar donde nace la matrícula.
 *
 * Garantías dentro de la transacción:
 * - Cupo verificado con la fila del salón BLOQUEADA (sin carreras).
 * - El tipo del curso del salón debe coincidir con el del contrato.
 * - Un contrato solo puede tener UNA matrícula ACTIVA.
 */
export async function matricularTx(
  tx: Queryable,
  input: {
    contractId: string;
    childPersonId: string;
    classroomId: string;
    tipoCursoContrato: string;
  },
  /** ACTIVA (alta normal) o RESERVADA (retiene cupo hasta aprobar). */
  estado: "ACTIVA" | "RESERVADA" = "ACTIVA",
): Promise<string> {
  const salon = await lockClassroom(tx, input.classroomId);
  if (salon === null || !salon.activo) {
    throw new NotFoundError("El salón no existe o está inactivo.");
  }
  if (salon.courseTipo !== input.tipoCursoContrato) {
    throw new ValidationError(
      `El salón es de tipo ${salon.courseTipo} y el contrato es ${input.tipoCursoContrato}.`,
    );
  }
  const viva = await findMatriculaVivaByContract(input.contractId, tx);
  if (viva !== null) {
    throw new ConflictError("El contrato ya tiene una matrícula activa o reservada.");
  }
  const ocupados = await countActivas(tx, input.classroomId);
  if (ocupados >= salon.cupo) {
    throw new ConflictError(`El salón está lleno (${ocupados}/${salon.cupo}).`);
  }
  return insertEnrollment(tx, { ...input, estado });
}

/**
 * Activa la matrícula RESERVADA de un contrato (al aprobar): RESERVADA→ACTIVA.
 * Devuelve el enrollmentId activado, o null si el contrato no tiene reserva.
 */
export async function activarReservaDeContratoTx(
  tx: Queryable,
  contractId: string,
): Promise<string | null> {
  const reserva = await findReservadaByContract(contractId, tx);
  if (reserva === null) return null;
  await activarReserva(tx, reserva.id);
  return reserva.id;
}

/** Matricula un contrato APROBADO en un salón (camino directo). */
export async function matricular(input: {
  actorUserId: string;
  contractId: string;
  classroomId: string;
  ip?: string | null;
}): Promise<{ enrollmentId: string }> {
  const contrato = await getContractData(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  if (contrato.estado !== "APROBADO") {
    throw new ConflictError(`Solo se matricula un contrato APROBADO (está ${contrato.estado}).`);
  }

  const enrollmentId = await withTransaction((tx) =>
    matricularTx(tx, {
      contractId: contrato.id,
      childPersonId: contrato.beneficiarioId,
      classroomId: input.classroomId,
      tipoCursoContrato: contrato.tipoCurso,
    }),
  );

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "enrollment.matriculado",
    entidad: "enrollment_enrollment",
    entidadId: enrollmentId,
    payload: { contrato: contrato.numero, classroomId: input.classroomId },
    ip: input.ip ?? null,
  });
  return { enrollmentId };
}

/**
 * CAMBIO ACADÉMICO (sección 2.7): mueve al niño a otro salón (de cualquier
 * campaña, mismo tipo de curso) en UNA transacción: cierra la matrícula
 * origen (historial conservado con motivo) y crea la nueva validando cupo
 * del destino. Las sesiones pasadas no se tocan; las futuras del niño son
 * las del salón destino por derivación.
 */
export async function cambioAcademico(input: {
  actorUserId: string;
  enrollmentId: string;
  nuevoClassroomId: string;
  motivo: string;
  ip?: string | null;
}): Promise<{ enrollmentId: string }> {
  if (input.motivo.trim().length < 5) {
    throw new ValidationError("El motivo del cambio es obligatorio (mínimo 5 caracteres).");
  }
  const actual = await findEnrollmentById(input.enrollmentId);
  if (actual === null || actual.estado !== "ACTIVA") {
    throw new NotFoundError("La matrícula no existe o no está activa.");
  }
  if (actual.classroomId === input.nuevoClassroomId) {
    throw new ValidationError("El salón destino es el mismo que el actual.");
  }
  const contrato = await getContractData(actual.contractId);
  if (contrato === null || contrato.estado !== "APROBADO") {
    throw new ConflictError("El contrato de la matrícula no está APROBADO.");
  }

  const nuevoId = await withTransaction(async (tx) => {
    await cerrarEnrollment(tx, actual.id, "FINALIZADA", `cambio académico: ${input.motivo.trim()}`);
    return matricularTx(tx, {
      contractId: actual.contractId,
      childPersonId: actual.childPersonId,
      classroomId: input.nuevoClassroomId,
      tipoCursoContrato: contrato.tipoCurso,
    });
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "enrollment.cambio_academico",
    entidad: "enrollment_enrollment",
    entidadId: nuevoId,
    payload: {
      desde: actual.classroomId,
      hacia: input.nuevoClassroomId,
      motivo: input.motivo.trim(),
      anterior: actual.id,
    },
    ip: input.ip ?? null,
  });
  return { enrollmentId: nuevoId };
}

/** Cancela la matrícula activa de un contrato (usado por la cascada de contratos). */
export async function cancelarMatriculaDeContratoTx(
  tx: Queryable,
  contractId: string,
  motivo: string,
): Promise<void> {
  const viva = await findMatriculaVivaByContract(contractId, tx);
  if (viva !== null) {
    await cerrarEnrollment(tx, viva.id, "CANCELADA", motivo);
  }
}

export async function obtenerRoster(classroomId: string): Promise<RosterItem[]> {
  return rosterSalon(classroomId);
}

export async function historialDeNino(childPersonId: string): Promise<EnrollmentHistoryItem[]> {
  return historialPorNino(childPersonId);
}

export async function matriculaDeNino(childPersonId: string): Promise<MatriculaActual | null> {
  return matriculaActualDeNino(childPersonId);
}

export { findActivaByContract, findMatriculaVivaByContract };
export type { MatriculaActual };
