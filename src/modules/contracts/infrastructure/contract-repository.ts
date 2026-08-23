import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { SQL_CONTRATO_VENCIDO } from "../domain/vigencia";

type Queryable = Pick<PoolClient, "query">;

export type ContractEstado = "PENDIENTE" | "APROBADO" | "ONHOLD" | "INACTIVO";

export interface ContractRecord {
  id: string;
  numero: number;
  titularId: string;
  beneficiarioId: string;
  countryCode: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  finalContrato: string;
  estado: ContractEstado;
}

const SELECT_CONTRACT = `SELECT id, numero, titular_id AS "titularId",
  beneficiario_id AS "beneficiarioId", country_code AS "countryCode",
  tipo_curso AS "tipoCurso", inicio::text AS inicio,
  final_contrato::text AS "finalContrato", estado
  FROM contracts_contract`;

export async function findContractById(
  id: string,
  client?: Queryable,
): Promise<ContractRecord | null> {
  return queryOne<ContractRecord>(`${SELECT_CONTRACT} WHERE id = $1`, [id], client);
}

export async function insertContract(
  input: {
    titularId: string;
    beneficiarioId: string;
    countryCode: string;
    tipoCurso: string;
    inicio: string;
    finalContrato: string;
    externalRef?: string | null;
    firmado?: boolean;
  },
  client?: Queryable,
): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO contracts_contract
       (id, titular_id, beneficiario_id, country_code, tipo_curso, inicio,
        final_contrato, external_ref, firmado, updated_at)
     VALUES ($1, $2, $3, $4, $5::catalog_course_tipo, $6::date, $7::date, $8, $9, now())`,
    [
      id,
      input.titularId,
      input.beneficiarioId,
      input.countryCode,
      input.tipoCurso,
      input.inicio,
      input.finalContrato,
      input.externalRef ?? null,
      input.firmado ?? false,
    ],
    client,
  );
  return id;
}

/** Busca un contrato por su referencia externa de LGS (idempotencia del alta). */
export async function findContractByExternalRef(
  externalRef: string,
  client?: Queryable,
): Promise<ContractRecord | null> {
  return queryOne<ContractRecord>(
    `${SELECT_CONTRACT} WHERE external_ref = $1`,
    [externalRef],
    client,
  );
}

export async function setContractEstado(
  id: string,
  estado: ContractEstado,
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE contracts_contract SET estado = $2::contracts_estado, updated_at = now() WHERE id = $1`,
    [id, estado],
    client,
  );
}

/** Suma días a final_contrato (extensión por OnHold). DATE + int = DATE. */
export async function extenderFinalContrato(
  id: string,
  dias: number,
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE contracts_contract
        SET final_contrato = final_contrato + $2::int, updated_at = now()
      WHERE id = $1`,
    [id, dias],
    client,
  );
}

export interface OnholdRecord {
  id: string;
  desde: string;
  hasta: string | null;
}

export async function findOnholdAbierto(
  contractId: string,
  client?: Queryable,
): Promise<OnholdRecord | null> {
  return queryOne<OnholdRecord>(
    `SELECT id, desde::text AS desde, hasta::text AS hasta
       FROM contracts_onhold WHERE contract_id = $1 AND hasta IS NULL`,
    [contractId],
    client,
  );
}

export async function insertOnhold(
  contractId: string,
  desde: string,
  motivo: string,
  client?: Queryable,
): Promise<void> {
  await execute(
    `INSERT INTO contracts_onhold (id, contract_id, desde, motivo)
     VALUES ($1, $2, $3::date, $4)`,
    [newId(), contractId, desde, motivo],
    client,
  );
}

export async function cerrarOnhold(
  onholdId: string,
  hasta: string,
  diasExtendidos: number,
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE contracts_onhold SET hasta = $2::date, dias_extendidos = $3 WHERE id = $1`,
    [onholdId, hasta, diasExtendidos],
    client,
  );
}

/** ¿Tiene el beneficiario otros contratos vivos (no inactivos)? */
export async function beneficiarioTieneOtrosContratosVivos(
  beneficiarioId: string,
  exceptoContractId: string,
  client?: Queryable,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM contracts_contract
      WHERE beneficiario_id = $1 AND id <> $2 AND estado <> 'INACTIVO'
      LIMIT 1`,
    [beneficiarioId, exceptoContractId],
    client,
  );
  return row !== null;
}

/** Contratos vivos ya VENCIDOS (regla única de +2 días, gemelo SQL). */
export async function findContratosVencidos(limit: number): Promise<ContractRecord[]> {
  return queryRows<ContractRecord>(
    `${SELECT_CONTRACT}
      WHERE estado IN ('APROBADO', 'ONHOLD')
        AND ${SQL_CONTRATO_VENCIDO}
      ORDER BY final_contrato
      LIMIT $1`,
    [limit],
  );
}

export interface ContractListItem extends ContractRecord {
  beneficiario: string;
  beneficiarioDocTipo: string;
  beneficiarioDocNumero: string;
  beneficiarioFechaNac: string | null;
  titular: string;
  titularDocTipo: string;
  titularDocNumero: string;
  titularTelefono: string | null;
  titularEmail: string | null;
  username: string | null;
  /** N° de contrato de LGS (formato PP-NNNNN-YY), si vino del intake. */
  externalRef: string | null;
  /** Matrícula ACTIVA (Fase 7): salón y matrícula, si existen. */
  salon: string | null;
  enrollmentId: string | null;
}

/** Lista con alcance por país (ADR-0009) y nombres resueltos. */
export async function listContracts(params: {
  countryScope: string[] | null;
  estado?: string;
  limit: number;
  offset: number;
}): Promise<ContractListItem[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (params.countryScope !== null) {
    values.push(params.countryScope);
    where.push(`c.country_code = ANY($${values.length})`);
  }
  if (params.estado !== undefined) {
    values.push(params.estado);
    where.push(`c.estado = $${values.length}::contracts_estado`);
  }
  values.push(params.limit);
  const limitIdx = values.length;
  values.push(params.offset);
  const offsetIdx = values.length;

  return queryRows<ContractListItem>(
    `SELECT c.id, c.numero, c.titular_id AS "titularId", c.beneficiario_id AS "beneficiarioId",
            c.country_code AS "countryCode", c.tipo_curso AS "tipoCurso",
            c.inicio::text AS inicio, c.final_contrato::text AS "finalContrato",
            c.estado, c.external_ref AS "externalRef",
            b.nombres || ' ' || b.apellidos AS beneficiario,
            b.doc_tipo AS "beneficiarioDocTipo", b.doc_numero AS "beneficiarioDocNumero",
            b.fecha_nacimiento::text AS "beneficiarioFechaNac",
            t.nombres || ' ' || t.apellidos AS titular,
            t.doc_tipo AS "titularDocTipo", t.doc_numero AS "titularDocNumero",
            t.telefono AS "titularTelefono", t.email AS "titularEmail",
            u.username,
            cl.nombre AS salon,
            e.id AS "enrollmentId"
       FROM contracts_contract c
       JOIN people_person b ON b.id = c.beneficiario_id
       JOIN people_person t ON t.id = c.titular_id
       LEFT JOIN identity_user u ON u.id = b.user_id
       LEFT JOIN enrollment_enrollment e ON e.contract_id = c.id AND e.estado = 'ACTIVA'
       LEFT JOIN scheduling_classroom cl ON cl.id = e.classroom_id
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );
}

/**
 * Búsqueda global de contratos: por NÚMERO exacto, o por nombre/apellido del
 * beneficiario o titular, o por username del alumno. Respeta el alcance por
 * país del solicitante.
 */
export async function searchContracts(params: {
  q: string;
  countryScope: string[] | null;
  limit: number;
}): Promise<ContractListItem[]> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (params.countryScope !== null) {
    values.push(params.countryScope);
    where.push(`c.country_code = ANY($${values.length})`);
  }
  if (/^\d+$/.test(params.q)) {
    values.push(Number(params.q));
    where.push(`c.numero = $${values.length}`);
  } else {
    values.push(`%${params.q}%`);
    const i = values.length;
    where.push(
      `(b.nombres ILIKE $${i} OR b.apellidos ILIKE $${i} OR t.nombres ILIKE $${i} OR t.apellidos ILIKE $${i} OR u.username ILIKE $${i} OR c.external_ref ILIKE $${i})`,
    );
  }
  values.push(params.limit);

  return queryRows<ContractListItem>(
    `SELECT c.id, c.numero, c.titular_id AS "titularId", c.beneficiario_id AS "beneficiarioId",
            c.country_code AS "countryCode", c.tipo_curso AS "tipoCurso",
            c.inicio::text AS inicio, c.final_contrato::text AS "finalContrato",
            c.estado, c.external_ref AS "externalRef",
            b.nombres || ' ' || b.apellidos AS beneficiario,
            b.doc_tipo AS "beneficiarioDocTipo", b.doc_numero AS "beneficiarioDocNumero",
            b.fecha_nacimiento::text AS "beneficiarioFechaNac",
            t.nombres || ' ' || t.apellidos AS titular,
            t.doc_tipo AS "titularDocTipo", t.doc_numero AS "titularDocNumero",
            t.telefono AS "titularTelefono", t.email AS "titularEmail",
            u.username,
            cl.nombre AS salon,
            e.id AS "enrollmentId"
       FROM contracts_contract c
       JOIN people_person b ON b.id = c.beneficiario_id
       JOIN people_person t ON t.id = c.titular_id
       LEFT JOIN identity_user u ON u.id = b.user_id
       LEFT JOIN enrollment_enrollment e ON e.contract_id = c.id AND e.estado = 'ACTIVA'
       LEFT JOIN scheduling_classroom cl ON cl.id = e.classroom_id
      WHERE ${where.join(" AND ")}
      ORDER BY c.numero DESC
      LIMIT $${values.length}`,
    values,
  );
}
