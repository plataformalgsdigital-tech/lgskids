import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { SQL_CONTRATO_VENCIDO } from "../domain/vigencia";

type Queryable = Pick<PoolClient, "query">;

export type ContractEstado = "PENDIENTE" | "APROBADO" | "ONHOLD" | "INACTIVO";

export interface ContractRecord {
  id: string;
  titularId: string;
  beneficiarioId: string;
  countryCode: string;
  tipoCurso: "JUNIOR" | "YOUNGSTER";
  inicio: string;
  finalContrato: string;
  estado: ContractEstado;
}

const SELECT_CONTRACT = `SELECT id, titular_id AS "titularId",
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
  },
  client?: Queryable,
): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO contracts_contract
       (id, titular_id, beneficiario_id, country_code, tipo_curso, inicio,
        final_contrato, updated_at)
     VALUES ($1, $2, $3, $4, $5::catalog_course_tipo, $6::date, $7::date, now())`,
    [
      id,
      input.titularId,
      input.beneficiarioId,
      input.countryCode,
      input.tipoCurso,
      input.inicio,
      input.finalContrato,
    ],
    client,
  );
  return id;
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
  titular: string;
  username: string | null;
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
    `SELECT c.id, c.titular_id AS "titularId", c.beneficiario_id AS "beneficiarioId",
            c.country_code AS "countryCode", c.tipo_curso AS "tipoCurso",
            c.inicio::text AS inicio, c.final_contrato::text AS "finalContrato",
            c.estado,
            b.nombres || ' ' || b.apellidos AS beneficiario,
            t.nombres || ' ' || t.apellidos AS titular,
            u.username
       FROM contracts_contract c
       JOIN people_person b ON b.id = c.beneficiario_id
       JOIN people_person t ON t.id = c.titular_id
       LEFT JOIN identity_user u ON u.id = b.user_id
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );
}
