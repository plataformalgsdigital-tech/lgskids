import { asignarRolTx, ROLES } from "@/modules/access";
import { registrarAuditoria } from "@/modules/audit";
import {
  activarReservaDeContratoTx,
  cancelarMatriculaDeContratoTx,
  matricularTx,
} from "@/modules/enrollment";
import {
  inactivarUsuarioTx,
  provisionarUsuarioAlumno,
  reactivarUsuarioTx,
  type AlumnoProvisionado,
} from "@/modules/identity";
import {
  findPersonById,
  findPersonByDoc,
  insertGuardianship,
  insertPerson,
  linkUser,
  setPersonEstado,
  type PersonInput,
} from "@/modules/people";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";
import { validarEdadParaTipo } from "../domain/edad";
import { validarExternalRef } from "../domain/external-ref";
import { contratoVencido, fechaUtcHoy, finalDeContrato } from "../domain/vigencia";
import {
  beneficiarioTieneOtrosContratosVivos,
  cerrarOnhold,
  extenderFinalContrato,
  findContractById,
  findContractByExternalRef,
  findContratosVencidos,
  findOnholdAbierto,
  insertContract,
  insertOnhold,
  listContracts,
  searchContracts,
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
 * Crea un contrato en estado PENDIENTE. Valida: titular activo, país del
 * contrato, y EDAD del niño a la fecha de inicio contra su fecha de
 * nacimiento (sección 2.5 — nunca se confía en el dato tipeado).
 *
 * El niño PUEDE estar inactivo: es la RENOVACIÓN de quien vuelve tras vencer
 * su contrato anterior (la cascada lo dejó INACTIVO). El alta única lo
 * reactiva al aprobar; antes esto se rechazaba y la única salida era darlo de
 * alta otra vez, con otro documento o duplicado.
 *
 * El FIN no se recibe: es inicio + 12 meses (`finalDeContrato`).
 */
export async function crearContrato(input: {
  actorUserId: string;
  titularId: string;
  beneficiarioId: string;
  countryCode: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  ip?: string | null;
}): Promise<string> {
  const finalContrato = finalDeContrato(input.inicio);
  const [titular, beneficiario] = await Promise.all([
    findPersonById(input.titularId),
    findPersonById(input.beneficiarioId),
  ]);
  if (titular === null || titular.estado !== "ACTIVA") {
    throw new NotFoundError("El titular no existe o está inactivo.");
  }
  if (beneficiario === null) {
    throw new NotFoundError("El beneficiario no existe.");
  }
  if (beneficiario.fechaNacimiento === null) {
    throw new ValidationError("El beneficiario no tiene fecha de nacimiento registrada.");
  }
  validarEdadParaTipo(beneficiario.fechaNacimiento, input.inicio, input.tipoCurso);

  const id = await insertContract({ ...input, finalContrato });
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

/** Rechaza si el documento (país+tipo+número) ya existe en otra persona. */
async function exigirDocLibre(p: PersonInput): Promise<void> {
  const existe = await findPersonByDoc(
    p.countryCode,
    p.docTipo.trim().toUpperCase(),
    p.docNumero.trim(),
  );
  if (existe !== null) {
    throw new ConflictError(
      `Ya existe una persona con documento ${p.docTipo} ${p.docNumero} en ${p.countryCode}.`,
    );
  }
}

/**
 * RESERVA DE BENEFICIARIO DESDE LGS (ADR-0010): crea, en UNA transacción,
 * titular + apoderado + niño (con guardianship) + contrato PENDIENTE (firmado,
 * con external_ref del contrato LGS) + matrícula RESERVADA en el salón elegido
 * (retiene cupo). El alumno se ACTIVA luego al aprobar el contrato. Idempotente
 * por external_ref. NO aprovisiona credenciales todavía (eso es el alta única).
 */
export async function crearReservaBeneficiario(input: {
  actorUserId: string;
  externalRef: string;
  countryCode: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  classroomId: string;
  titular: PersonInput;
  titularEsApoderado?: boolean | undefined;
  apoderadoNuevo?: PersonInput | undefined;
  nino: PersonInput; // exige fechaNacimiento
  parentesco?: string | null | undefined;
  ip?: string | null;
}): Promise<{ contractId: string; externalRef: string; enrollmentId: string }> {
  // El fin no se recibe (ni de LGS ni del asistente): inicio + 12 meses.
  const finalContrato = finalDeContrato(input.inicio);
  if (!input.nino.fechaNacimiento) {
    throw new ValidationError("El niño necesita fecha de nacimiento.");
  }
  if (input.titularEsApoderado !== true && input.apoderadoNuevo === undefined) {
    throw new ValidationError("Falta el apoderado (o marca titular = apoderado).");
  }
  // N° de contrato LGS: formato PP-NNNNN-YY y país del prefijo == país del contrato.
  validarExternalRef(input.externalRef, input.countryCode);
  validarEdadParaTipo(input.nino.fechaNacimiento, input.inicio, input.tipoCurso);

  const yaExiste = await findContractByExternalRef(input.externalRef);
  if (yaExiste !== null) {
    throw new ConflictError(`Ya existe una reserva para el contrato LGS ${input.externalRef}.`);
  }
  await exigirDocLibre(input.titular);
  if (input.apoderadoNuevo !== undefined) await exigirDocLibre(input.apoderadoNuevo);
  await exigirDocLibre(input.nino);

  const resultado = await withTransaction(async (tx) => {
    const titularId = await insertPerson(input.titular, tx);
    const apoderadoId =
      input.titularEsApoderado === true
        ? titularId
        : await insertPerson(input.apoderadoNuevo as PersonInput, tx);
    const ninoId = await insertPerson(input.nino, tx);
    await insertGuardianship(ninoId, apoderadoId, input.parentesco ?? null, tx);
    const contractId = await insertContract(
      {
        titularId,
        beneficiarioId: ninoId,
        countryCode: input.countryCode,
        tipoCurso: input.tipoCurso,
        inicio: input.inicio,
        finalContrato,
        externalRef: input.externalRef,
        firmado: true,
      },
      tx,
    );
    const enrollmentId = await matricularTx(
      tx,
      {
        contractId,
        childPersonId: ninoId,
        classroomId: input.classroomId,
        tipoCursoContrato: input.tipoCurso,
      },
      "RESERVADA",
    );
    return { contractId, enrollmentId };
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.reserva_creada",
    entidad: "contracts_contract",
    entidadId: resultado.contractId,
    payload: {
      externalRef: input.externalRef,
      tipoCurso: input.tipoCurso,
      pais: input.countryCode,
      classroomId: input.classroomId,
    },
    ip: input.ip ?? null,
  });
  return {
    contractId: resultado.contractId,
    externalRef: input.externalRef,
    enrollmentId: resultado.enrollmentId,
  };
}

/**
 * APRUEBA un contrato — EL ALTA ÚNICA DEL ALUMNO (regla dura 5), en UNA
 * transacción: contrato → APROBADO y, si el niño aún no tiene credenciales,
 * se aprovisionan aquí (username autogenerado + correo sintético + rol
 * alumno con alcance del país del contrato). En la Fase 7 este MISMO caso de
 * uso sumará la matrícula al salón y sus inscripciones. No hay otro camino.
 *
 * Si el niño VUELVE (renovación: persona y cuenta quedaron INACTIVAS al vencer
 * el contrato anterior), aquí se REACTIVAN, conservando su usuario: la
 * activación del alumno ocurre al aprobar, igual que la primera vez. Antes la
 * cuenta seguía apagada y el niño, con contrato vigente, no podía entrar.
 */
export async function aprobarContrato(input: {
  actorUserId: string;
  contractId: string;
  /** Si viene, el alta única incluye la MATRÍCULA en ese salón (Fase 7). */
  classroomId?: string | null;
  ip?: string | null;
}): Promise<{
  credenciales: AlumnoProvisionado | null;
  enrollmentId: string | null;
  /** Id de la cuenta existente que se reactivó (renovación). */
  reactivado: string | null;
}> {
  const contrato = await findContractById(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  if (contrato.estado !== "PENDIENTE") {
    throw new ConflictError(
      `Solo se puede aprobar un contrato PENDIENTE (está ${contrato.estado}).`,
    );
  }
  const beneficiario = await findPersonById(contrato.beneficiarioId);
  if (beneficiario === null) {
    throw new ConflictError("El beneficiario no existe.");
  }

  const resultado = await withTransaction(async (tx) => {
    await setContractEstado(contrato.id, "APROBADO", tx);
    if (beneficiario.estado !== "ACTIVA") {
      await setPersonEstado(beneficiario.id, "ACTIVA", tx);
    }

    let credenciales: AlumnoProvisionado | null = null;
    let reactivado: string | null = null;
    if (beneficiario.userId === null) {
      credenciales = await provisionarUsuarioAlumno(tx, {
        nombres: beneficiario.nombres,
        apellidos: beneficiario.apellidos,
      });
      await linkUser(beneficiario.id, credenciales.userId, tx);
      await asignarRolTx(tx, {
        userId: credenciales.userId,
        roleCode: ROLES.ALUMNO,
        countryCode: contrato.countryCode,
      });
    } else {
      if (await reactivarUsuarioTx(tx, beneficiario.userId)) {
        reactivado = beneficiario.userId;
      }
      // El contrato nuevo puede ser de OTRO país: el rol lo sigue (idempotente).
      await asignarRolTx(tx, {
        userId: beneficiario.userId,
        roleCode: ROLES.ALUMNO,
        countryCode: contrato.countryCode,
      });
    }

    // Si el contrato viene de una RESERVA (entrada LGS), se ACTIVA su matrícula
    // reservada en vez de crear una nueva. Si no, se matricula en el salón dado.
    let enrollmentId: string | null = await activarReservaDeContratoTx(tx, contrato.id);
    if (enrollmentId === null && input.classroomId != null) {
      enrollmentId = await matricularTx(tx, {
        contractId: contrato.id,
        childPersonId: contrato.beneficiarioId,
        classroomId: input.classroomId,
        tipoCursoContrato: contrato.tipoCurso,
      });
    }
    return { credenciales, enrollmentId, reactivado };
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.aprobado",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: {
      beneficiarioId: contrato.beneficiarioId,
      credencialesCreadas: resultado.credenciales !== null,
      ...(resultado.credenciales !== null && { username: resultado.credenciales.username }),
      ...(resultado.reactivado !== null && { cuentaReactivada: resultado.reactivado }),
      ...(resultado.enrollmentId !== null && { enrollmentId: resultado.enrollmentId }),
    },
    ip: input.ip ?? null,
  });
  return resultado;
}

/** Aprueba (alta única) la reserva de un contrato identificado por su ref LGS. */
export async function aprobarReservaPorExternalRef(input: {
  actorUserId: string;
  externalRef: string;
  ip?: string | null;
}): Promise<{
  credenciales: AlumnoProvisionado | null;
  enrollmentId: string | null;
  reactivado: string | null;
}> {
  const contrato = await findContractByExternalRef(input.externalRef);
  if (contrato === null) {
    throw new NotFoundError(`No hay contrato con referencia LGS ${input.externalRef}.`);
  }
  return aprobarContrato({
    actorUserId: input.actorUserId,
    contractId: contrato.id,
    ip: input.ip ?? null,
  });
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
    // La cascada también CANCELA la matrícula activa (Fase 7): el niño sale
    // de la lista del salón por derivación, sin tocar sesiones pasadas.
    await cancelarMatriculaDeContratoTx(tx, contrato.id, `inactivación: ${input.motivo.trim()}`);
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

/** Búsqueda global (número, nombres, username) con alcance por país. */
export async function buscarContratos(params: {
  q: string;
  countryScope: string[] | null;
  limit?: number;
}): Promise<ContractListItem[]> {
  const q = params.q.trim();
  if (q.length < 2) return [];
  return searchContracts({
    q,
    countryScope: params.countryScope,
    limit: Math.min(Math.max(params.limit ?? 10, 1), 50),
  });
}

export async function listarContratos(params: {
  countryScope: string[] | null;
  estado?: string;
  pais?: string;
  tipoCurso?: string;
  campaignId?: string;
  inicioDesde?: string;
  finalHasta?: string;
  limit?: number;
  offset?: number;
}): Promise<ContractListItem[]> {
  return listContracts({
    countryScope: params.countryScope,
    ...(params.estado !== undefined && { estado: params.estado }),
    ...(params.pais !== undefined && { pais: params.pais }),
    ...(params.tipoCurso !== undefined && { tipoCurso: params.tipoCurso }),
    ...(params.campaignId !== undefined && { campaignId: params.campaignId }),
    ...(params.inicioDesde !== undefined && { inicioDesde: params.inicioDesde }),
    ...(params.finalHasta !== undefined && { finalHasta: params.finalHasta }),
    limit: Math.min(Math.max(params.limit ?? 50, 1), 200),
    offset: Math.max(params.offset ?? 0, 0),
  });
}

export async function obtenerContrato(id: string): Promise<ContractRecord> {
  const contrato = await findContractById(id);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  return contrato;
}
