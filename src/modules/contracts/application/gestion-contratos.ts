import { asignarRolTx, ROLES } from "@/modules/access";
import { registrarAuditoria } from "@/modules/audit";
import {
  inactivarUsuarioTx,
  provisionarUsuarioAlumno,
  type AlumnoProvisionado,
} from "@/modules/identity";
import { findPersonById, linkUser, setPersonEstado } from "@/modules/people";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";
import { validarEdadParaTipo } from "../domain/edad";
import { contratoVencido, fechaUtcHoy } from "../domain/vigencia";
import {
  beneficiarioTieneOtrosContratosVivos,
  cerrarOnhold,
  extenderFinalContrato,
  findContractById,
  findContratosVencidos,
  findOnholdAbierto,
  insertContract,
  insertOnhold,
  listContracts,
  setContractEstado,
  type ContractListItem,
  type ContractRecord,
} from "../infrastructure/contract-repository";

/** Días entre dos DATE (YYYY-MM-DD), calendario puro. */
function diasEntre(desde: string, hasta: string): number {
  const [dy, dm, dd] = desde.split("-").map(Number);
  const [hy, hm, hd] = hasta.split("-").map(Number);
  const a = Date.UTC(dy ?? 0, (dm ?? 1) - 1, dd ?? 1);
  const b = Date.UTC(hy ?? 0, (hm ?? 1) - 1, hd ?? 1);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Crea un contrato en estado PENDIENTE. Valida: personas activas, país del
 * contrato, y EDAD del niño a la fecha de inicio contra su fecha de
 * nacimiento (sección 2.5 — nunca se confía en el dato tipeado).
 */
export async function crearContrato(input: {
  actorUserId: string;
  titularId: string;
  beneficiarioId: string;
  countryCode: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  finalContrato: string;
  ip?: string | null;
}): Promise<string> {
  if (input.finalContrato <= input.inicio) {
    throw new ValidationError("final_contrato debe ser posterior al inicio.");
  }
  const [titular, beneficiario] = await Promise.all([
    findPersonById(input.titularId),
    findPersonById(input.beneficiarioId),
  ]);
  if (titular === null || titular.estado !== "ACTIVA") {
    throw new NotFoundError("El titular no existe o está inactivo.");
  }
  if (beneficiario === null || beneficiario.estado !== "ACTIVA") {
    throw new NotFoundError("El beneficiario no existe o está inactivo.");
  }
  if (beneficiario.fechaNacimiento === null) {
    throw new ValidationError("El beneficiario no tiene fecha de nacimiento registrada.");
  }
  validarEdadParaTipo(beneficiario.fechaNacimiento, input.inicio, input.tipoCurso);

  const id = await insertContract(input);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.creado",
    entidad: "contracts_contract",
    entidadId: id,
    payload: { tipoCurso: input.tipoCurso, pais: input.countryCode, inicio: input.inicio },
    ip: input.ip ?? null,
  });
  return id;
}

/**
 * APRUEBA un contrato — EL ALTA ÚNICA DEL ALUMNO (regla dura 5), en UNA
 * transacción: contrato → APROBADO y, si el niño aún no tiene credenciales,
 * se aprovisionan aquí (username autogenerado + correo sintético + rol
 * alumno con alcance del país del contrato). En la Fase 7 este MISMO caso de
 * uso sumará la matrícula al salón y sus inscripciones. No hay otro camino.
 */
export async function aprobarContrato(input: {
  actorUserId: string;
  contractId: string;
  ip?: string | null;
}): Promise<{ credenciales: AlumnoProvisionado | null }> {
  const contrato = await findContractById(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  if (contrato.estado !== "PENDIENTE") {
    throw new ConflictError(
      `Solo se puede aprobar un contrato PENDIENTE (está ${contrato.estado}).`,
    );
  }
  const beneficiario = await findPersonById(contrato.beneficiarioId);
  if (beneficiario === null || beneficiario.estado !== "ACTIVA") {
    throw new ConflictError("El beneficiario no está activo.");
  }

  const credenciales = await withTransaction(async (tx) => {
    await setContractEstado(contrato.id, "APROBADO", tx);
    if (beneficiario.userId !== null) {
      return null; // ya tenía credenciales (ej. segundo contrato)
    }
    const alumno = await provisionarUsuarioAlumno(tx, {
      nombres: beneficiario.nombres,
      apellidos: beneficiario.apellidos,
    });
    await linkUser(beneficiario.id, alumno.userId, tx);
    await asignarRolTx(tx, {
      userId: alumno.userId,
      roleCode: ROLES.ALUMNO,
      countryCode: contrato.countryCode,
    });
    return alumno;
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.aprobado",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: {
      beneficiarioId: contrato.beneficiarioId,
      credencialesCreadas: credenciales !== null,
      ...(credenciales !== null && { username: credenciales.username }),
    },
    ip: input.ip ?? null,
  });
  return { credenciales };
}

/** Pausa (OnHold) un contrato APROBADO. Motivo obligatorio, auditado. */
export async function ponerEnPausa(input: {
  actorUserId: string;
  contractId: string;
  motivo: string;
  ip?: string | null;
}): Promise<void> {
  if (input.motivo.trim().length < 5) {
    throw new ValidationError("El motivo es obligatorio (mínimo 5 caracteres).");
  }
  const contrato = await findContractById(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  if (contrato.estado !== "APROBADO") {
    throw new ConflictError(`Solo se pausa un contrato APROBADO (está ${contrato.estado}).`);
  }
  await withTransaction(async (tx) => {
    await setContractEstado(contrato.id, "ONHOLD", tx);
    await insertOnhold(contrato.id, fechaUtcHoy(), input.motivo.trim(), tx);
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.onhold",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { motivo: input.motivo.trim() },
    ip: input.ip ?? null,
  });
}

/**
 * REACTIVA un contrato en pausa: extiende `final_contrato` por los días
 * pausados (el niño NO pierde días — sección 2.4), con registro en el
 * historial de la pausa.
 */
export async function reactivar(input: {
  actorUserId: string;
  contractId: string;
  ip?: string | null;
}): Promise<{ diasExtendidos: number; nuevoFinal: string }> {
  const contrato = await findContractById(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  if (contrato.estado !== "ONHOLD") {
    throw new ConflictError(`Solo se reactiva un contrato ONHOLD (está ${contrato.estado}).`);
  }
  const pausa = await findOnholdAbierto(contrato.id);
  if (pausa === null) {
    throw new ConflictError(
      "El contrato está ONHOLD pero no tiene pausa abierta (inconsistencia).",
    );
  }
  const hoy = fechaUtcHoy();
  const dias = Math.max(diasEntre(pausa.desde, hoy), 0);

  await withTransaction(async (tx) => {
    await cerrarOnhold(pausa.id, hoy, dias, tx);
    if (dias > 0) {
      await extenderFinalContrato(contrato.id, dias, tx);
    }
    await setContractEstado(contrato.id, "APROBADO", tx);
  });

  const actualizado = await findContractById(contrato.id);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.reactivado",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { diasExtendidos: dias, nuevoFinal: actualizado?.finalContrato },
    ip: input.ip ?? null,
  });
  return { diasExtendidos: dias, nuevoFinal: actualizado?.finalContrato ?? contrato.finalContrato };
}

/**
 * INACTIVA un contrato con CASCADA SINCRONIZADA (sección 2.4): contrato +
 * persona + credenciales, en una transacción. Si solo se actualizara una
 * tabla quedarían niños entrando con contrato vencido.
 * La persona y sus credenciales solo se inactivan si NO tiene otros
 * contratos vivos.
 */
export async function inactivarContrato(input: {
  actorUserId: string | null;
  contractId: string;
  motivo: string;
  ip?: string | null;
}): Promise<void> {
  if (input.motivo.trim().length < 5) {
    throw new ValidationError("El motivo es obligatorio (mínimo 5 caracteres).");
  }
  const contrato = await findContractById(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  if (contrato.estado === "INACTIVO") {
    return; // idempotente
  }
  const beneficiario = await findPersonById(contrato.beneficiarioId);

  await withTransaction(async (tx) => {
    await setContractEstado(contrato.id, "INACTIVO", tx);
    const pausa = await findOnholdAbierto(contrato.id, tx);
    if (pausa !== null) {
      await cerrarOnhold(pausa.id, fechaUtcHoy(), 0, tx);
    }
    const tieneOtros = await beneficiarioTieneOtrosContratosVivos(
      contrato.beneficiarioId,
      contrato.id,
      tx,
    );
    if (!tieneOtros && beneficiario !== null) {
      await setPersonEstado(beneficiario.id, "INACTIVA", tx);
      if (beneficiario.userId !== null) {
        await inactivarUsuarioTx(tx, beneficiario.userId);
      }
    }
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.inactivado",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { motivo: input.motivo.trim() },
    ip: input.ip ?? null,
  });
}

/**
 * Tarea del worker: inactiva contratos vivos ya VENCIDOS según LA función
 * única (+2 días de gracia). Idempotente y por lotes.
 */
export async function procesarVencimientos(): Promise<number> {
  const vencidos = await findContratosVencidos(200);
  for (const contrato of vencidos) {
    // Doble verificación con la función de dominio (misma regla).
    if (!contratoVencido(contrato.finalContrato)) {
      logger.warn("SQL y dominio discrepan en vencimiento", { contratoId: contrato.id });
      continue;
    }
    await inactivarContrato({
      actorUserId: null,
      contractId: contrato.id,
      motivo: "vencimiento automático (+2 días de gracia)",
    });
  }
  return vencidos.length;
}

export async function listarContratos(params: {
  countryScope: string[] | null;
  estado?: string;
  limit?: number;
  offset?: number;
}): Promise<ContractListItem[]> {
  return listContracts({
    countryScope: params.countryScope,
    ...(params.estado !== undefined && { estado: params.estado }),
    limit: Math.min(Math.max(params.limit ?? 50, 1), 200),
    offset: Math.max(params.offset ?? 0, 0),
  });
}

export async function obtenerContrato(id: string): Promise<ContractRecord> {
  const contrato = await findContractById(id);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  return contrato;
}
