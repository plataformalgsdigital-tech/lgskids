import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import type { PersonInput, PersonListItem, PersonRecord } from "../application/ports";

type Queryable = Pick<PoolClient, "query">;

const SELECT_PERSON = `SELECT id, nombres, apellidos,
  fecha_nacimiento::text AS "fechaNacimiento",
  doc_tipo AS "docTipo", doc_numero AS "docNumero",
  country_code AS "countryCode", email, telefono, estado, user_id AS "userId"
  FROM people_person`;

export async function findPersonById(id: string, client?: Queryable): Promise<PersonRecord | null> {
  return queryOne<PersonRecord>(`${SELECT_PERSON} WHERE id = $1`, [id], client);
}

export async function findPersonByDoc(
  countryCode: string,
  docTipo: string,
  docNumero: string,
): Promise<PersonRecord | null> {
  return queryOne<PersonRecord>(
    `${SELECT_PERSON} WHERE country_code = $1 AND doc_tipo = $2 AND doc_numero = $3`,
    [countryCode, docTipo, docNumero],
  );
}

export async function insertPerson(input: PersonInput, client?: Queryable): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO people_person
       (id, nombres, apellidos, fecha_nacimiento, doc_tipo, doc_numero,
        country_code, email, telefono, updated_at)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, now())`,
    [
      id,
      input.nombres.trim(),
      input.apellidos.trim(),
      input.fechaNacimiento ?? null,
      input.docTipo.trim().toUpperCase(),
      input.docNumero.trim(),
      input.countryCode,
      input.email?.trim() || null,
      input.telefono?.trim() || null,
    ],
    client,
  );
  return id;
}

export async function insertGuardianship(
  ninoId: string,
  apoderadoId: string,
  parentesco: string | null,
  client?: Queryable,
): Promise<void> {
  await execute(
    `INSERT INTO people_guardianship (id, nino_id, apoderado_id, parentesco)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (nino_id, apoderado_id) DO NOTHING`,
    [newId(), ninoId, apoderadoId, parentesco],
    client,
  );
}

export async function linkUser(
  personId: string,
  userId: string,
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE people_person SET user_id = $2, updated_at = now() WHERE id = $1`,
    [personId, userId],
    client,
  );
}

export async function setPersonEstado(
  personId: string,
  estado: "ACTIVA" | "INACTIVA",
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE people_person SET estado = $2::people_person_estado, updated_at = now() WHERE id = $1`,
    [personId, estado],
    client,
  );
}

/**
 * Lista paginada con ALCANCE POR PAÍS: si `countryScope` no es null, solo se
 * ven personas de esos países (ADR-0009). Búsqueda simple por nombre/documento.
 */
export async function listPersons(params: {
  countryScope: string[] | null;
  buscar?: string;
  limit: number;
  offset: number;
}): Promise<PersonListItem[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (params.countryScope !== null) {
    values.push(params.countryScope);
    where.push(`p.country_code = ANY($${values.length})`);
  }
  if (params.buscar !== undefined && params.buscar !== "") {
    values.push(`%${params.buscar}%`);
    where.push(
      `(p.nombres ILIKE $${values.length} OR p.apellidos ILIKE $${values.length} OR p.doc_numero ILIKE $${values.length})`,
    );
  }
  values.push(params.limit);
  const limitIdx = values.length;
  values.push(params.offset);
  const offsetIdx = values.length;

  interface Row extends PersonRecord {
    apoderados: { id: string; nombres: string; apellidos: string }[] | null;
  }
  const rows = await queryRows<Row>(
    `SELECT p.id, p.nombres, p.apellidos,
            p.fecha_nacimiento::text AS "fechaNacimiento",
            p.doc_tipo AS "docTipo", p.doc_numero AS "docNumero",
            p.country_code AS "countryCode", p.email, p.telefono, p.estado,
            p.user_id AS "userId",
            (SELECT json_agg(json_build_object('id', a.id, 'nombres', a.nombres, 'apellidos', a.apellidos))
               FROM people_guardianship g
               JOIN people_person a ON a.id = g.apoderado_id
              WHERE g.nino_id = p.id) AS apoderados
       FROM people_person p
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY p.apellidos, p.nombres
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );
  return rows.map((r) => ({ ...r, apoderados: r.apoderados ?? [] }));
}
