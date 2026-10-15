import { asignarRolTx, ROLES } from "@/modules/access";
import { registrarAuditoria } from "@/modules/audit";
import { recalcularProgresion, ubicarTx } from "@/modules/progression";
import {
  activarReservaDeContratoTx,
  cancelarMatriculaDeContratoTx,
  findMatriculaVivaByContract,
  matricularTx,
  moverMatriculaTx,
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
import { queryOne } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";
import { enviarCreacionPerfilSinFallar, type EnvioEnlacePerfil } from "./perfil-nino";
import { estadoAcademico, type EstadoAcademico } from "../domain/academico";
import { validarEdadParaTipo } from "../domain/edad";
import { parseExternalRef, validarExternalRef } from "../domain/external-ref";
import {
  contratoVencido,
  diasDePausa,
  diasEntreFechas,
  fechaUtcHoy,
  finalDeContrato,
  sumarDias,
} from "../domain/vigencia";
import {
  avisarExtensionALgs,
  avisarOnholdALgs,
  lgsSyncConfigurado,
} from "../infrastructure/lgs-sync";
import {
  beneficiarioTieneOtrosContratosVivos,
  cerrarOnhold,
  contarExtensiones,
  contarPausas,
  insertExtension,
  externalRefDe,
  extenderFinalContrato,
  findPausasVencidas,
  findContractById,
  findContractByExternalRef,
  findContractItem,
  findContractsPorRefBase,
  findContratosVencidos,
  findOnholdAbierto,
  insertContract,
  insertOnhold,
  listContracts,
  searchContracts,
  setContractEstado,
  setContractTipoCurso,
  type ContractListItem,
  type ContractRecord,
} from "../infrastructure/contract-repository";

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
 * La persona por su documento (país + tipo + número, la misma llave única de la
 * tabla) o, si no existe, la crea. Para titulares y apoderados: una misma
 * persona firma por varios hermanos. Sus datos guardados NO se pisan.
 */
async function personaExistenteOInsertar(
  p: PersonInput,
  tx: Parameters<typeof insertPerson>[1],
): Promise<string> {
  const existe = await findPersonByDoc(
    p.countryCode,
    p.docTipo.trim().toUpperCase(),
    p.docNumero.trim(),
    tx,
  );
  return existe?.id ?? insertPerson(p, tx);
}

/**
 * La reserva YA existía: se devuelve tal cual en vez de fallar.
 *
 * Esto es lo que hace la puerta IDEMPOTENTE, y no es un adorno: LGS manda la
 * reserva al crear el contrato y, si la respuesta se pierde (un corte, un
 * tiempo de espera), reintenta. Con un 409 ahí, LGS guardaba `errorKids`, no
 * anotaba `enviadoAKids` y su paso de aprobación —que solo mira los enviados—
 * nunca corría: el niño quedaba RESERVADO en KIDS, ocupando cupo, y sin cuenta
 * jamás. Devolviéndole los ids, el reintento se arregla solo.
 *
 * Se comprueba que sea EL MISMO niño: la misma referencia con otro documento
 * no es un reintento, es un error de quien llama, y ahí sí conviene el 409.
 */
async function reservaYaHecha(
  contrato: { id: string; beneficiarioId: string },
  externalRef: string,
  nino: PersonInput,
): Promise<{ contractId: string; externalRef: string; enrollmentId: string }> {
  const existente = await findPersonByDoc(
    nino.countryCode,
    nino.docTipo.trim().toUpperCase(),
    nino.docNumero.trim(),
  );
  if (existente === null || existente.id !== contrato.beneficiarioId) {
    throw new ConflictError(
      `El contrato LGS ${externalRef} ya está reservado para otro niño. Revisa el número: cada niño lleva el suyo (contrato#documento).`,
    );
  }
  const matricula = await findMatriculaVivaByContract(contrato.id);
  if (matricula === null) {
    throw new ConflictError(
      `El contrato LGS ${externalRef} ya existe pero su matrícula fue cancelada: revísalo en el panel antes de volver a enviarlo.`,
    );
  }
  logger.info("Reserva LGS repetida: se devuelve la existente", { externalRef });
  return { contractId: contrato.id, externalRef, enrollmentId: matricula.id };
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
    return reservaYaHecha(yaExiste, input.externalRef, input.nino);
  }
  // Solo el NIÑO tiene que ser nuevo. El titular y el apoderado se REUTILIZAN si
  // ya existen: un contrato de LGS trae varios hermanos y en KIDS cada uno es su
  // propio contrato, todos con el MISMO titular. Antes se exigía también el
  // documento del titular libre y el segundo hermano se rechazaba con 409, que
  // LGS toma como "ya existía": quedaba marcado como enviado sin existir.
  await exigirDocLibre(input.nino);

  const resultado = await withTransaction(async (tx) => {
    const titularId = await personaExistenteOInsertar(input.titular, tx);
    const apoderadoId =
      input.titularEsApoderado === true
        ? titularId
        : await personaExistenteOInsertar(input.apoderadoNuevo as PersonInput, tx);
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
  /**
   * false = aprobar SIN mandar el WhatsApp de creación de perfil (por ejemplo,
   * una migración: el enlace se manda después desde la ficha). Por defecto sí.
   */
  enviarPerfil?: boolean;
  ip?: string | null;
}): Promise<{
  credenciales: AlumnoProvisionado | null;
  enrollmentId: string | null;
  /** Id de la cuenta existente que se reactivó (renovación). */
  reactivado: string | null;
  /** El WhatsApp con el enlace de creación de perfil (null: ya tenía perfil). */
  perfil: EnvioEnlacePerfil | null;
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

  // Aprobado: el apoderado recibe por WhatsApp el enlace con el que el niño
  // crea su perfil y agenda su Welcome. Sale de KIDS por los DOS caminos (panel
  // y LGS). Fuera de la transacción y sin poder tumbar el alta: si WhatsApp
  // falla, se dice en la respuesta y se reenvía desde la ficha. Quien ya creó
  // su perfil (una renovación) no lo recibe otra vez.
  const yaTienePerfil = await queryOne<{ completado: string | null }>(
    `SELECT perfil_completado_en AS completado FROM people_person WHERE id = $1`,
    [contrato.beneficiarioId],
  );
  const perfil =
    input.enviarPerfil !== false && yaTienePerfil?.completado == null
      ? await enviarCreacionPerfilSinFallar({
          actorUserId: input.actorUserId,
          childPersonId: contrato.beneficiarioId,
          contractId: contrato.id,
          ip: input.ip ?? null,
        })
      : null;
  return { ...resultado, perfil };
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

/** Tope de pausas por contrato — la MISMA regla que LGS (máximo 2 OnHold). */
const MAX_PAUSAS = 2;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reglas de LGS para abrir un OnHold: máximo 2 por contrato y ninguno si el
 * contrato ya tuvo una extensión manual (OnHold y extensión no se combinan).
 */
async function exigirPuedePausar(contractId: string): Promise<void> {
  if ((await contarPausas(contractId)) >= MAX_PAUSAS) {
    throw new ValidationError(
      `No se puede activar OnHold: el contrato ya alcanzó el máximo de ${String(MAX_PAUSAS)} OnHolds.`,
    );
  }
  if ((await contarExtensiones(contractId)) > 0) {
    throw new ValidationError(
      "No se puede activar OnHold: el contrato ya tuvo una extensión manual.",
    );
  }
}

/** Nombre de usuario de quien actúa (para el historial de la pausa). */
async function usernameDe(userId: string): Promise<string | null> {
  const row = await queryOne<{ username: string }>(
    `SELECT username FROM identity_user WHERE id = $1`,
    [userId],
  );
  return row?.username ?? null;
}

/**
 * Abre la pausa en KIDS: contrato → ONHOLD, registro con inicio + fin
 * programado + motivo, y login del niño BLOQUEADO (igual que LGS) salvo que
 * tenga otro contrato vivo. Valida lo mismo que LGS.
 */
async function abrirPausa(
  contrato: ContractRecord,
  datos: { desde: string; hasta: string; motivo: string; activadoPor: string | null },
  origen: "KIDS" | "LGS",
): Promise<void> {
  const motivo = datos.motivo.trim();
  if (motivo.length < 5) {
    throw new ValidationError("El motivo es obligatorio (mínimo 5 caracteres).");
  }
  if (!FECHA_ISO.test(datos.desde) || !FECHA_ISO.test(datos.hasta)) {
    throw new ValidationError("La fecha de inicio y la fecha de fin del OnHold son obligatorias.");
  }
  if (datos.hasta <= datos.desde) {
    throw new ValidationError("La fecha fin del OnHold debe ser posterior a la fecha de inicio.");
  }
  if (contrato.estado !== "APROBADO") {
    throw new ConflictError(`Solo se pausa un contrato APROBADO (está ${contrato.estado}).`);
  }
  await exigirPuedePausar(contrato.id);
  const beneficiario = await findPersonById(contrato.beneficiarioId);
  await withTransaction(async (tx) => {
    await setContractEstado(contrato.id, "ONHOLD", tx);
    await insertOnhold(contrato.id, datos.desde, motivo, tx, {
      hastaProgramado: datos.hasta,
      tipo: "ONHOLD",
      origen,
      activadoPor: datos.activadoPor,
    });
    const tieneOtros = await beneficiarioTieneOtrosContratosVivos(
      contrato.beneficiarioId,
      contrato.id,
      tx,
    );
    if (!tieneOtros && beneficiario?.userId) await inactivarUsuarioTx(tx, beneficiario.userId);
  });
}

/**
 * Pausa (OnHold) un contrato APROBADO desde el panel de KIDS. Pide lo mismo
 * que LGS: fecha de inicio, fecha de fin y motivo. Si el contrato viene de LGS,
 * LGS se actualiza PRIMERO (valida sus reglas: tope de 2, extensión manual
 * previa); si LGS lo rechaza o no responde, no se pausa en ningún lado.
 */
export async function ponerEnPausa(input: {
  actorUserId: string;
  contractId: string;
  desde: string;
  hasta: string;
  motivo: string;
  ip?: string | null;
}): Promise<{ lgs: "SINCRONIZADO" | "NO_APLICA" | "SIN_CONFIGURAR" }> {
  const contrato = await findContractById(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  if (contrato.estado !== "APROBADO") {
    throw new ConflictError(`Solo se pausa un contrato APROBADO (está ${contrato.estado}).`);
  }
  // Todo lo que abrirPausa valida, ANTES de tocar LGS.
  if (input.motivo.trim().length < 5) {
    throw new ValidationError("El motivo es obligatorio (mínimo 5 caracteres).");
  }
  if (!FECHA_ISO.test(input.desde) || !FECHA_ISO.test(input.hasta)) {
    throw new ValidationError("La fecha de inicio y la fecha de fin del OnHold son obligatorias.");
  }
  if (input.hasta <= input.desde) {
    throw new ValidationError("La fecha fin del OnHold debe ser posterior a la fecha de inicio.");
  }
  await exigirPuedePausar(contrato.id);
  const activadoPor = await usernameDe(input.actorUserId);
  const externalRef = await externalRefDe(contrato.id);

  let lgs: "SINCRONIZADO" | "NO_APLICA" | "SIN_CONFIGURAR" = "NO_APLICA";
  if (externalRef !== null) {
    if (!lgsSyncConfigurado()) {
      lgs = "SIN_CONFIGURAR";
    } else {
      const r = await avisarOnholdALgs({
        accion: "activar",
        externalRef,
        desde: input.desde,
        hasta: input.hasta,
        motivo: input.motivo.trim(),
        activadoPor,
      });
      lgs = r.aplicado === false ? "NO_APLICA" : "SINCRONIZADO";
    }
  }

  try {
    await abrirPausa(
      contrato,
      { desde: input.desde, hasta: input.hasta, motivo: input.motivo, activadoPor },
      "KIDS",
    );
  } catch (error) {
    // LGS ya quedó en OnHold: se deshace allá (0 días) para no dejarlos distintos.
    if (lgs === "SINCRONIZADO" && externalRef !== null) {
      await avisarOnholdALgs({ accion: "reactivar", externalRef, dias: 0 }).catch((e: unknown) =>
        logger.error("No se pudo deshacer el OnHold en LGS", { externalRef, error: String(e) }),
      );
    }
    throw error;
  }
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.onhold",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { desde: input.desde, hasta: input.hasta, motivo: input.motivo.trim(), lgs },
    ip: input.ip ?? null,
  });
  return { lgs };
}

/**
 * OnHold abierto en LGS (beneficiario Kids): la misma pausa aquí, sin avisar
 * de vuelta. Idempotente: si el contrato no está APROBADO (reserva pendiente,
 * ya en pausa, inactivo) responde `aplicado: false` y LGS sigue con lo suyo.
 */
export async function pausarPorExternalRef(input: {
  actorUserId: string;
  externalRef: string;
  desde: string;
  hasta: string;
  motivo: string;
  activadoPor: string | null;
  ip?: string | null;
}): Promise<{ aplicado: boolean; estado: string }> {
  const contrato = await findContractByExternalRef(input.externalRef);
  if (contrato === null) {
    throw new NotFoundError(`No hay contrato con referencia LGS ${input.externalRef}.`);
  }
  if (contrato.estado !== "APROBADO") return { aplicado: false, estado: contrato.estado };
  await abrirPausa(
    contrato,
    {
      desde: input.desde,
      hasta: input.hasta,
      motivo: input.motivo.trim() || "OnHold en LGS",
      activadoPor: input.activadoPor,
    },
    "LGS",
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.onhold_lgs",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: {
      desde: input.desde,
      hasta: input.hasta,
      motivo: input.motivo,
      activadoPor: input.activadoPor,
    },
    ip: input.ip ?? null,
  });
  return { aplicado: true, estado: "ONHOLD" };
}

/**
 * Cierra una pausa extendiendo `final_contrato` por `dias` y reactivando el
 * contrato y el login. Es el núcleo de las tres salidas: manual en KIDS, fin
 * de OnHold en LGS y fin programado (worker).
 */
async function cerrarPausa(contrato: ContractRecord, pausaId: string, dias: number): Promise<void> {
  const beneficiario = await findPersonById(contrato.beneficiarioId);
  await withTransaction(async (tx) => {
    await cerrarOnhold(pausaId, fechaUtcHoy(), dias, tx);
    if (dias > 0) await extenderFinalContrato(contrato.id, dias, tx);
    await setContractEstado(contrato.id, "APROBADO", tx);
    if (beneficiario?.userId) await reactivarUsuarioTx(tx, beneficiario.userId);
  });
}

/**
 * Fin de OnHold en LGS (manual o por su cron): cierra la pausa con los MISMOS
 * días que extendió LGS, para que la fecha final quede igual en los dos lados.
 * Idempotente: sin pausa OnHold abierta responde `aplicado: false`.
 */
export async function finPausaPorExternalRef(input: {
  actorUserId: string;
  externalRef: string;
  dias: number;
  ip?: string | null;
}): Promise<{ aplicado: boolean; estado: string; nuevoFinal?: string }> {
  const contrato = await findContractByExternalRef(input.externalRef);
  if (contrato === null) {
    throw new NotFoundError(`No hay contrato con referencia LGS ${input.externalRef}.`);
  }
  if (contrato.estado !== "ONHOLD") return { aplicado: false, estado: contrato.estado };
  const pausa = await findOnholdAbierto(contrato.id);
  if (pausa === null || pausa.tipo !== "ONHOLD") return { aplicado: false, estado: "ONHOLD" };
  const dias = Math.max(Math.round(input.dias), 0);
  await cerrarPausa(contrato, pausa.id, dias);
  const actualizado = await findContractById(contrato.id);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.reactivado_lgs_onhold",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { diasExtendidos: dias, nuevoFinal: actualizado?.finalContrato },
    ip: input.ip ?? null,
  });
  return {
    aplicado: true,
    estado: "APROBADO",
    ...(actualizado !== null && { nuevoFinal: actualizado.finalContrato }),
  };
}

/**
 * Aplica una extensión MANUAL de vigencia en KIDS — lo mismo que hace LGS:
 * corre `final_contrato` N días, la deja en el historial y REACTIVA al niño si
 * estaba fuera (contrato INACTIVO, o suspendido desde LGS). Un OnHold vigente
 * se respeta: solo se corre la fecha y sigue en pausa.
 */
async function aplicarExtension(
  contrato: ContractRecord,
  datos: { dias: number; motivo: string; origen: "KIDS" | "LGS"; ejecutadoPor: string | null },
): Promise<{ nuevoFinal: string; reactivado: boolean; requiereMatricula: boolean }> {
  const beneficiario = await findPersonById(contrato.beneficiarioId);
  const pausa = contrato.estado === "ONHOLD" ? await findOnholdAbierto(contrato.id) : null;
  const nuevoFinal = sumarDias(contrato.finalContrato, datos.dias);
  let reactivado = false;
  await withTransaction(async (tx) => {
    await extenderFinalContrato(contrato.id, datos.dias, tx);
    await insertExtension(tx, {
      contractId: contrato.id,
      dias: datos.dias,
      finalAnterior: contrato.finalContrato,
      finalNuevo: nuevoFinal,
      motivo: datos.motivo,
      origen: datos.origen,
      ejecutadoPor: datos.ejecutadoPor,
    });
    if (contrato.estado === "INACTIVO") {
      // Vencido o inactivado: vuelve, igual que en LGS (la matrícula se canceló
      // al inactivar, así que puede quedar pendiente de salón).
      await setContractEstado(contrato.id, "APROBADO", tx);
      if (beneficiario !== null && beneficiario.estado !== "ACTIVA") {
        await setPersonEstado(beneficiario.id, "ACTIVA", tx);
      }
      if (beneficiario?.userId) await reactivarUsuarioTx(tx, beneficiario.userId);
      reactivado = true;
    } else if (pausa?.tipo === "SUSPENSION") {
      await cerrarOnhold(pausa.id, fechaUtcHoy(), 0, tx);
      await setContractEstado(contrato.id, "APROBADO", tx);
      if (beneficiario?.userId) await reactivarUsuarioTx(tx, beneficiario.userId);
      reactivado = true;
    }
  });
  const requiereMatricula = reactivado && (await findMatriculaVivaByContract(contrato.id)) === null;
  return { nuevoFinal, reactivado, requiereMatricula };
}

/**
 * EXTENSIÓN MANUAL desde el panel de KIDS. Pide lo mismo que LGS: nueva fecha
 * final (posterior a la actual) y motivo. Si el contrato viene de LGS, LGS se
 * extiende PRIMERO con los mismos días; si LGS lo rechaza o no responde, no se
 * extiende en ningún lado.
 */
export async function extenderContrato(input: {
  actorUserId: string;
  contractId: string;
  nuevaFecha: string;
  motivo: string;
  ip?: string | null;
}): Promise<{
  dias: number;
  nuevoFinal: string;
  reactivado: boolean;
  requiereMatricula: boolean;
  lgs: "SINCRONIZADO" | "NO_APLICA" | "SIN_CONFIGURAR";
}> {
  const motivo = input.motivo.trim();
  if (motivo.length < 5) {
    throw new ValidationError("El motivo es obligatorio (mínimo 5 caracteres).");
  }
  if (!FECHA_ISO.test(input.nuevaFecha)) {
    throw new ValidationError("La nueva fecha final es obligatoria.");
  }
  const contrato = await findContractById(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  const dias = diasEntreFechas(contrato.finalContrato, input.nuevaFecha);
  if (dias <= 0) {
    throw new ValidationError(
      `La nueva fecha debe ser posterior a la vigencia actual (${contrato.finalContrato}).`,
    );
  }
  const ejecutadoPor = await usernameDe(input.actorUserId);
  const externalRef = await externalRefDe(contrato.id);

  let lgs: "SINCRONIZADO" | "NO_APLICA" | "SIN_CONFIGURAR" = "NO_APLICA";
  if (externalRef !== null) {
    if (!lgsSyncConfigurado()) {
      lgs = "SIN_CONFIGURAR";
    } else {
      const r = await avisarExtensionALgs({ externalRef, dias, motivo, ejecutadoPor });
      lgs = r.aplicado === false ? "NO_APLICA" : "SINCRONIZADO";
    }
  }

  const r = await aplicarExtension(contrato, { dias, motivo, origen: "KIDS", ejecutadoPor });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.extendido",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { dias, finalAnterior: contrato.finalContrato, nuevoFinal: r.nuevoFinal, motivo, lgs },
    ip: input.ip ?? null,
  });
  return { dias, ...r, lgs };
}

/**
 * Extensión hecha en LGS (beneficiario Kids): la misma aquí, con los MISMOS
 * días y sin avisar de vuelta.
 */
export async function extenderPorExternalRef(input: {
  actorUserId: string;
  externalRef: string;
  dias: number;
  motivo: string;
  ejecutadoPor: string | null;
  ip?: string | null;
}): Promise<{
  aplicado: boolean;
  nuevoFinal: string;
  reactivado: boolean;
  requiereMatricula: boolean;
}> {
  const contrato = await findContractByExternalRef(input.externalRef);
  if (contrato === null) {
    throw new NotFoundError(`No hay contrato con referencia LGS ${input.externalRef}.`);
  }
  const dias = Math.round(input.dias);
  if (dias <= 0) throw new ValidationError("Los días de extensión deben ser mayores que 0.");
  const motivo =
    input.motivo.trim().length >= 5 ? input.motivo.trim() : "Extensión registrada en LGS";
  const r = await aplicarExtension(contrato, {
    dias,
    motivo,
    origen: "LGS",
    ejecutadoPor: input.ejecutadoPor,
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.extendido_lgs",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { dias, finalAnterior: contrato.finalContrato, nuevoFinal: r.nuevoFinal, motivo },
    ip: input.ip ?? null,
  });
  return { aplicado: true, ...r };
}

/**
 * Tarea del worker: cierra las pausas cuyo FIN PROGRAMADO ya llegó (como el
 * cron de LGS). Devuelve los días hasta el fin programado y avisa a LGS; si
 * LGS no responde se cierra igual aquí (su propio cron lo cierra allá) y queda
 * en el log. Idempotente.
 */
export async function procesarFinesDePausa(): Promise<number> {
  const hoy = fechaUtcHoy();
  const vencidas = await findPausasVencidas(hoy, 200);
  for (const pausa of vencidas) {
    const contrato = await findContractById(pausa.contractId);
    if (contrato === null || contrato.estado !== "ONHOLD") continue;
    const dias = diasDePausa(pausa.desde, pausa.hastaProgramado, hoy);
    const externalRef = await externalRefDe(contrato.id);
    if (externalRef !== null && lgsSyncConfigurado()) {
      try {
        await avisarOnholdALgs({ accion: "reactivar", externalRef, dias });
      } catch (error) {
        logger.warn("Fin de OnHold: LGS no confirmó (se cierra igual en KIDS)", {
          contratoId: contrato.id,
          error: String(error),
        });
      }
    }
    await cerrarPausa(contrato, pausa.id, dias);
    await registrarAuditoria({
      actorUserId: null,
      accion: "contracts.reactivado_automatico",
      entidad: "contracts_contract",
      entidadId: contrato.id,
      payload: { diasExtendidos: dias, hastaProgramado: pausa.hastaProgramado },
      ip: null,
    });
  }
  return vencidas.length;
}

/** Prefijo del motivo de las pausas que abre LGS: solo esas las cierra LGS. */
const PREFIJO_PAUSA_LGS = "LGS: ";

/**
 * SUSPENSIÓN ADMINISTRATIVA desde LGS (el beneficiario se inactivó allá).
 * APROBADO → ONHOLD (situación SUSPENDIDO, conserva la matrícula y el cupo) +
 * bloquea el login del niño si no tiene otro contrato vivo. Idempotente: un
 * contrato ya en pausa o que no está APROBADO (reserva pendiente, inactivo)
 * no se toca y se informa con `aplicado: false`.
 */
export async function suspenderPorExternalRef(input: {
  actorUserId: string;
  externalRef: string;
  motivo: string;
  ip?: string | null;
}): Promise<{ aplicado: boolean; estado: string }> {
  const contrato = await findContractByExternalRef(input.externalRef);
  if (contrato === null) {
    throw new NotFoundError(`No hay contrato con referencia LGS ${input.externalRef}.`);
  }
  if (contrato.estado !== "APROBADO") return { aplicado: false, estado: contrato.estado };
  const motivo = `${PREFIJO_PAUSA_LGS}${input.motivo.trim() || "Inactivado en LGS"}`.slice(0, 500);
  const beneficiario = await findPersonById(contrato.beneficiarioId);
  await withTransaction(async (tx) => {
    await setContractEstado(contrato.id, "ONHOLD", tx);
    await insertOnhold(contrato.id, fechaUtcHoy(), motivo, tx, {
      tipo: "SUSPENSION",
      origen: "LGS",
      activadoPor: "LGS",
    });
    const tieneOtros = await beneficiarioTieneOtrosContratosVivos(
      contrato.beneficiarioId,
      contrato.id,
      tx,
    );
    if (!tieneOtros && beneficiario?.userId) await inactivarUsuarioTx(tx, beneficiario.userId);
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.suspendido_lgs",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { motivo },
    ip: input.ip ?? null,
  });
  return { aplicado: true, estado: "ONHOLD" };
}

/**
 * REACTIVACIÓN desde LGS: cierra SOLO una pausa abierta por LGS (motivo con
 * prefijo "LGS: "), sin extender `final_contrato` — en LGS la suspensión
 * administrativa no devuelve días (no es un OnHold) — y reactiva el login.
 * Una pausa abierta en KIDS (OnHold propio) no se toca.
 */
export async function reactivarPorExternalRef(input: {
  actorUserId: string;
  externalRef: string;
  ip?: string | null;
}): Promise<{ aplicado: boolean; estado: string; motivo?: string }> {
  const contrato = await findContractByExternalRef(input.externalRef);
  if (contrato === null) {
    throw new NotFoundError(`No hay contrato con referencia LGS ${input.externalRef}.`);
  }
  if (contrato.estado !== "ONHOLD") return { aplicado: false, estado: contrato.estado };
  const pausa = await findOnholdAbierto(contrato.id);
  // Solo la SUSPENSIÓN (inactivación en LGS; las antiguas, con prefijo "LGS: ",
  // las marcó la migración 20261014700000). Un OnHold —venga de KIDS o de
  // LGS— se cierra devolviendo días, por su propio camino.
  if (pausa === null || pausa.tipo !== "SUSPENSION") {
    return {
      aplicado: false,
      estado: "ONHOLD",
      motivo: "Es un OnHold (no una suspensión): se cierra con el fin del OnHold.",
    };
  }
  const beneficiario = await findPersonById(contrato.beneficiarioId);
  await withTransaction(async (tx) => {
    await cerrarOnhold(pausa.id, fechaUtcHoy(), 0, tx);
    await setContractEstado(contrato.id, "APROBADO", tx);
    if (beneficiario?.userId) await reactivarUsuarioTx(tx, beneficiario.userId);
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.reactivado_lgs",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: {},
    ip: input.ip ?? null,
  });
  return { aplicado: true, estado: "APROBADO" };
}

/**
 * REACTIVA un contrato en pausa desde el panel: extiende `final_contrato` por
 * los días REALMENTE pausados (misma regla que LGS: hasta hoy, o hasta el fin
 * programado si ya pasó) y reactiva el login. Si es un OnHold de un contrato
 * que viene de LGS, LGS se reactiva PRIMERO con esos mismos días — así la
 * fecha final queda igual en los dos lados. Una SUSPENSIÓN (inactivación en
 * LGS) no devuelve días.
 */
export async function reactivar(input: {
  actorUserId: string;
  contractId: string;
  ip?: string | null;
}): Promise<{
  diasExtendidos: number;
  nuevoFinal: string;
  lgs: "SINCRONIZADO" | "NO_APLICA" | "SIN_CONFIGURAR";
}> {
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
  const dias = pausa.tipo === "SUSPENSION" ? 0 : diasDePausa(pausa.desde, pausa.hastaProgramado);

  let lgs: "SINCRONIZADO" | "NO_APLICA" | "SIN_CONFIGURAR" = "NO_APLICA";
  const externalRef = pausa.tipo === "ONHOLD" ? await externalRefDe(contrato.id) : null;
  if (externalRef !== null) {
    if (!lgsSyncConfigurado()) {
      lgs = "SIN_CONFIGURAR";
    } else {
      const r = await avisarOnholdALgs({ accion: "reactivar", externalRef, dias });
      lgs = r.aplicado === false ? "NO_APLICA" : "SINCRONIZADO";
    }
  }

  await cerrarPausa(contrato, pausa.id, dias);

  const actualizado = await findContractById(contrato.id);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.reactivado",
    entidad: "contracts_contract",
    entidadId: contrato.id,
    payload: { diasExtendidos: dias, nuevoFinal: actualizado?.finalContrato, lgs },
    ip: input.ip ?? null,
  });
  return {
    diasExtendidos: dias,
    nuevoFinal: actualizado?.finalContrato ?? contrato.finalContrato,
    lgs,
  };
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
  classroomId?: string;
  matriculaEstado?: string;
  inicioDesde?: string;
  finalHasta?: string;
  limit?: number;
  offset?: number;
}): Promise<ContractListItem[]> {
  return listContracts({
    countryScope: params.countryScope,
    ...(params.matriculaEstado !== undefined && { matriculaEstado: params.matriculaEstado }),
    ...(params.estado !== undefined && { estado: params.estado }),
    ...(params.pais !== undefined && { pais: params.pais }),
    ...(params.tipoCurso !== undefined && { tipoCurso: params.tipoCurso }),
    ...(params.campaignId !== undefined && { campaignId: params.campaignId }),
    ...(params.classroomId !== undefined && { classroomId: params.classroomId }),
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

/**
 * "¿Está cursando?" para una fila de contrato. UNA regla
 * (`domain/academico.ts`), la misma que responde la puerta de LGS: si cada
 * pantalla la rearmara, tarde o temprano dirían cosas distintas del mismo niño.
 */
export function academicoDeContrato(c: ContractListItem): EstadoAcademico {
  return estadoAcademico({
    contratoEstado: c.estado as "PENDIENTE" | "APROBADO" | "ONHOLD" | "INACTIVO",
    vencido: c.vencido,
    matriculaEstado: c.matriculaEstado as "ACTIVA" | "RESERVADA" | null,
  });
}

export interface FichaContrato {
  contrato: ContractListItem;
  /**
   * Los OTROS niños del mismo contrato de LGS. En KIDS cada niño es su propio
   * contrato, así que la ficha de uno enseña a sus hermanos y cada tarjeta
   * actúa sobre SU contrato.
   */
  hermanos: ContractListItem[];
}

/** Ficha del contrato: su titular, su beneficiario y los hermanos. */
export async function fichaContrato(
  id: string,
  countryScope: string[] | null,
): Promise<FichaContrato> {
  const contrato = await findContractItem(id, countryScope);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  // Sin N° de LGS (contrato hecho en KIDS) no hay con qué agrupar hermanos.
  const partes = contrato.externalRef === null ? null : parseExternalRef(contrato.externalRef);
  const hermanos =
    partes === null
      ? []
      : (await findContractsPorRefBase(partes.base, countryScope)).filter(
          (c) => c.id !== contrato.id,
        );
  return { contrato, hermanos };
}

/**
 * CAMBIO DE CURSO: el niño pasa de Junior a Youngster (o al revés).
 *
 * Es más que mover de salón: cambia el `tipo_curso` del CONTRATO, y por eso
 * vive aquí y no en enrollment. Va todo en una transacción — el contrato y su
 * matrícula tienen que quedar del mismo curso, o `matricularTx` rechazaría el
 * siguiente movimiento.
 *
 * La EDAD **advierte, no bloquea**, y es a propósito: los rangos de los dos
 * cursos son disjuntos (6–9 y 10–13) y la edad se mide a la fecha de INICIO,
 * así que exigirla como en el alta haría imposible TODO cambio de curso. Los
 * casos reales son justamente los que la regla de alta no contempla: el niño
 * cumplió años, o llegó con la fecha de nacimiento equivocada y se corrigió.
 * La advertencia viaja en la respuesta y queda en la auditoría con el motivo.
 */
export async function cambiarCursoContrato(input: {
  actorUserId: string;
  contractId: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  /** Salón del curso nuevo. Obligatorio si el niño está matriculado. */
  classroomId?: string | null;
  /**
   * Punto de partida en el curso NUEVO (Academic Change › promover/degradar).
   * El avance de cada curso es independiente: sin esto, el niño que pasa a
   * Youngster empezaría desde el Welcome.
   */
  ubicacion?: { levelId: string; lecciones: number } | null;
  motivo: string;
  ip?: string | null;
}): Promise<{ enrollmentId: string | null; advertencia: string | null }> {
  if (input.motivo.trim().length < 5) {
    throw new ValidationError("El motivo del cambio es obligatorio (mínimo 5 caracteres).");
  }
  const contrato = await findContractById(input.contractId);
  if (contrato === null) throw new NotFoundError("El contrato no existe.");
  if (contrato.tipoCurso === input.tipoCurso) {
    throw new ValidationError("El contrato ya está en ese curso.");
  }
  if (contrato.estado === "INACTIVO") {
    throw new ConflictError("El contrato está inactivo.");
  }

  const nino = await findPersonById(contrato.beneficiarioId);
  let advertencia: string | null = null;
  if (nino?.fechaNacimiento != null) {
    try {
      validarEdadParaTipo(nino.fechaNacimiento, contrato.inicio, input.tipoCurso);
    } catch (e) {
      // La MISMA regla del alta, en modo aviso: quien lo hace ve exactamente
      // qué se está saltando, y queda escrito junto a su motivo.
      advertencia = e instanceof ValidationError ? e.message : "La edad no cuadra con el curso.";
    }
  }

  const viva = await findMatriculaVivaByContract(input.contractId);
  if (viva !== null && (input.classroomId == null || input.classroomId === "")) {
    throw new ValidationError(
      "Elige el salón del curso nuevo: el niño está matriculado y tiene que quedar en uno.",
    );
  }

  if (input.ubicacion != null && viva === null) {
    throw new ValidationError(
      "Sin matrícula no hay curso en el que ubicarlo: matricúlalo primero en un salón.",
    );
  }

  const enrollmentId = await withTransaction(async (tx) => {
    await setContractTipoCurso(input.contractId, input.tipoCurso, tx);
    if (viva === null || input.classroomId == null) return null;
    const nueva = await moverMatriculaTx(tx, {
      enrollmentId: viva.id,
      contractId: input.contractId,
      childPersonId: contrato.beneficiarioId,
      nuevoClassroomId: input.classroomId,
      tipoCursoContrato: input.tipoCurso,
      motivo: `cambio de curso: ${input.motivo.trim()}`,
    });
    // En la MISMA transacción: si el nivel no es del curso nuevo, no se mueve
    // nada. Un cambio a medias dejaría al niño en Youngster desde el Welcome.
    if (input.ubicacion != null) {
      await ubicarTx(tx, {
        childPersonId: contrato.beneficiarioId,
        levelId: input.ubicacion.levelId,
        lecciones: input.ubicacion.lecciones,
        motivo: `cambio de curso: ${input.motivo.trim()}`,
        actorUserId: input.actorUserId,
      });
    }
    return nueva;
  });

  // CAMINO 5 de LA FUNCIÓN CENTRAL: el curso cambió, y con él el avance que
  // le corresponde (cada curso tiene el suyo). Se re-deriva en el momento.
  await recalcularProgresion(contrato.beneficiarioId);

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "contracts.curso_cambiado",
    entidad: "contracts_contract",
    entidadId: input.contractId,
    payload: {
      desde: contrato.tipoCurso,
      hacia: input.tipoCurso,
      motivo: input.motivo.trim(),
      classroomId: input.classroomId ?? null,
      ubicacion: input.ubicacion ?? null,
      advertencia,
    },
    ip: input.ip ?? null,
  });
  return { enrollmentId, advertencia };
}
