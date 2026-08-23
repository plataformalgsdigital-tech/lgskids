import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { withTransaction } from "@/platform/db/transaction";
import type { PersonInput, PersonListItem, PersonRecord } from "./ports";
import {
  findPersonByDoc,
  findPersonById,
  insertGuardianship,
  insertPerson,
  listNinos,
  listPersons,
  type NinoListItem,
} from "../infrastructure/person-repository";

async function exigirDocLibre(input: PersonInput): Promise<void> {
  const existente = await findPersonByDoc(
    input.countryCode,
    input.docTipo.trim().toUpperCase(),
    input.docNumero.trim(),
  );
  if (existente !== null) {
    throw new ConflictError(
      `Ya existe una persona con documento ${input.docTipo} ${input.docNumero} en ${input.countryCode}.`,
      { details: { personaId: existente.id } },
    );
  }
}

/** Crea un adulto (apoderado y/o titular). */
export async function crearAdulto(input: PersonInput & { actorUserId: string }): Promise<string> {
  await exigirDocLibre(input);
  const id = await insertPerson(input);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "people.adulto_creado",
    entidad: "people_person",
    entidadId: id,
  });
  return id;
}

/**
 * Crea un NIÑO con su apoderado en UNA transacción (sección 2.5).
 * El apoderado puede ser uno existente (apoderadoId) o crearse aquí mismo
 * (apoderadoNuevo) — el atajo "¿el titular será el apoderado?" lo resuelve
 * la UI pasando la misma persona.
 */
export async function crearNino(input: {
  actorUserId: string;
  nino: PersonInput;
  apoderadoId?: string;
  apoderadoNuevo?: PersonInput;
  parentesco?: string | null;
}): Promise<{ ninoId: string; apoderadoId: string }> {
  if (!input.nino.fechaNacimiento) {
    throw new ValidationError("La fecha de nacimiento del niño es obligatoria.");
  }
  if ((input.apoderadoId === undefined) === (input.apoderadoNuevo === undefined)) {
    throw new ValidationError("Indica el apoderado: uno existente O uno nuevo (no ambos).");
  }
  await exigirDocLibre(input.nino);
  if (input.apoderadoNuevo !== undefined) {
    await exigirDocLibre(input.apoderadoNuevo);
  }
  if (input.apoderadoId !== undefined) {
    const apoderado = await findPersonById(input.apoderadoId);
    if (apoderado === null || apoderado.estado !== "ACTIVA") {
      throw new NotFoundError("El apoderado indicado no existe o está inactivo.");
    }
  }

  const resultado = await withTransaction(async (tx: PoolClient) => {
    const apoderadoId =
      input.apoderadoId ?? (await insertPerson(input.apoderadoNuevo as PersonInput, tx));
    const ninoId = await insertPerson(input.nino, tx);
    await insertGuardianship(ninoId, apoderadoId, input.parentesco ?? null, tx);
    return { ninoId, apoderadoId };
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "people.nino_creado",
    entidad: "people_person",
    entidadId: resultado.ninoId,
    payload: { apoderadoId: resultado.apoderadoId },
  });
  return resultado;
}

export async function listarPersonas(params: {
  countryScope: string[] | null;
  buscar?: string;
  limit?: number;
  offset?: number;
}): Promise<PersonListItem[]> {
  return listPersons({
    countryScope: params.countryScope,
    ...(params.buscar !== undefined && { buscar: params.buscar }),
    limit: Math.min(Math.max(params.limit ?? 50, 1), 200),
    offset: Math.max(params.offset ?? 0, 0),
  });
}

/** Lista de niños (sección Kids) con filtros. */
export async function listarNinos(params: {
  countryScope: string[] | null;
  id?: string;
  estado?: string;
  tipoCurso?: string;
  campaignId?: string;
  inicioDesde?: string;
  finalHasta?: string;
  limit?: number;
  offset?: number;
}): Promise<NinoListItem[]> {
  return listNinos({
    countryScope: params.countryScope,
    ...(params.id !== undefined && { id: params.id }),
    ...(params.estado !== undefined && { estado: params.estado }),
    ...(params.tipoCurso !== undefined && { tipoCurso: params.tipoCurso }),
    ...(params.campaignId !== undefined && { campaignId: params.campaignId }),
    ...(params.inicioDesde !== undefined && { inicioDesde: params.inicioDesde }),
    ...(params.finalHasta !== undefined && { finalHasta: params.finalHasta }),
    limit: Math.min(Math.max(params.limit ?? 100, 1), 500),
    offset: Math.max(params.offset ?? 0, 0),
  });
}

export async function obtenerPersona(id: string): Promise<PersonRecord> {
  const persona = await findPersonById(id);
  if (persona === null) {
    throw new NotFoundError("La persona no existe.");
  }
  return persona;
}
