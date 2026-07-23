import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";

type Queryable = Pick<PoolClient, "query">;

export interface EnrollmentRecord {
  id: string;
  contractId: string;
  childPersonId: string;
  classroomId: string;
  estado: "ACTIVA" | "FINALIZADA" | "CANCELADA";
}

const SELECT_ENROLLMENT = `SELECT id, contract_id AS "contractId",
  child_person_id AS "childPersonId", classroom_id AS "classroomId", estado
  FROM enrollment_enrollment`;

export async function findEnrollmentById(
  id: string,
  client?: Queryable,
): Promise<EnrollmentRecord | null> {
  return queryOne<EnrollmentRecord>(`${SELECT_ENROLLMENT} WHERE id = $1`, [id], client);
}

export async function findActivaByContract(
  contractId: string,
  client?: Queryable,
): Promise<EnrollmentRecord | null> {
  return queryOne<EnrollmentRecord>(
    `${SELECT_ENROLLMENT} WHERE contract_id = $1 AND estado = 'ACTIVA'`,
    [contractId],
    client,
  );
}

/**
 * BLOQUEA la fila del salón (FOR UPDATE) y devuelve cupo + tipo del curso.
 * Es la barrera contra la carrera de cupos: dos matrículas simultáneas al
 * mismo salón se serializan aquí.
 */
export async function lockClassroom(
  tx: Queryable,
  classroomId: string,
): Promise<{ cupo: number; courseTipo: string; activo: boolean } | null> {
  return queryOne<{ cupo: number; courseTipo: string; activo: boolean }>(
    `SELECT cl.cupo, cu.tipo::text AS "courseTipo", cl.activo
       FROM scheduling_classroom cl
       JOIN catalog_course cu ON cu.id = cl.course_id
      WHERE cl.id = $1
      FOR UPDATE OF cl`,
    [classroomId],
    tx,
  );
}

export async function countActivas(tx: Queryable, classroomId: string): Promise<number> {
  const row = await queryOne<{ total: string }>(
    `SELECT count(*)::text AS total FROM enrollment_enrollment
      WHERE classroom_id = $1 AND estado = 'ACTIVA'`,
    [classroomId],
    tx,
  );
  return row === null ? 0 : Number(row.total);
}

export async function insertEnrollment(
  tx: Queryable,
  input: { contractId: string; childPersonId: string; classroomId: string },
): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO enrollment_enrollment
       (id, contract_id, child_person_id, classroom_id, updated_at)
     VALUES ($1, $2, $3, $4, now())`,
    [id, input.contractId, input.childPersonId, input.classroomId],
    tx,
  );
  return id;
}

export async function cerrarEnrollment(
  tx: Queryable,
  id: string,
  estado: "FINALIZADA" | "CANCELADA",
  motivo: string,
): Promise<void> {
  await execute(
    `UPDATE enrollment_enrollment
        SET estado = $2::enrollment_estado, motivo_cierre = $3, updated_at = now()
      WHERE id = $1 AND estado = 'ACTIVA'`,
    [id, estado, motivo],
    tx,
  );
}

/** Lectura del contrato (solo lectura de tabla ajena; evita ciclo de módulos). */
export async function getContractData(
  contractId: string,
  client?: Queryable,
): Promise<{
  id: string;
  numero: number;
  beneficiarioId: string;
  tipoCurso: string;
  estado: string;
} | null> {
  return queryOne(
    `SELECT id, numero, beneficiario_id AS "beneficiarioId",
            tipo_curso::text AS "tipoCurso", estado::text AS estado
       FROM contracts_contract WHERE id = $1`,
    [contractId],
    client,
  );
}

export interface MatriculaActual {
  classroomId: string;
  salon: string;
  campania: string;
  tipoCurso: string;
  guia: string | null;
  meetingUrl: string | null;
  timezone: string;
}

/** Matrícula ACTIVA del niño con datos del salón (para su panel). */
export async function matriculaActualDeNino(
  childPersonId: string,
): Promise<MatriculaActual | null> {
  return queryOne<MatriculaActual>(
    `SELECT cl.id AS "classroomId", cl.nombre AS salon, ca.nombre AS campania,
            cu.tipo::text AS "tipoCurso",
            COALESCE(gp.nombres || ' ' || gp.apellidos, gu.username) AS guia,
            cl.meeting_url AS "meetingUrl", cl.timezone
       FROM enrollment_enrollment e
       JOIN scheduling_classroom cl ON cl.id = e.classroom_id
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN identity_user gu ON gu.id = cl.guia_user_id
       LEFT JOIN people_person gp ON gp.user_id = gu.id
      WHERE e.child_person_id = $1 AND e.estado = 'ACTIVA'
      LIMIT 1`,
    [childPersonId],
  );
}

export interface RosterItem {
  enrollmentId: string;
  childPersonId: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  contratoNumero: number;
}

/** LISTA del salón DERIVADA de las matrículas ACTIVAS (regla de oro). */
export async function rosterSalon(classroomId: string): Promise<RosterItem[]> {
  return queryRows<RosterItem>(
    `SELECT e.id AS "enrollmentId", p.id AS "childPersonId",
            p.nombres, p.apellidos, u.username, c.numero AS "contratoNumero"
       FROM enrollment_enrollment e
       JOIN people_person p ON p.id = e.child_person_id
       JOIN contracts_contract c ON c.id = e.contract_id
       LEFT JOIN identity_user u ON u.id = p.user_id
      WHERE e.classroom_id = $1 AND e.estado = 'ACTIVA'
      ORDER BY p.apellidos, p.nombres`,
    [classroomId],
  );
}

export interface EnrollmentHistoryItem extends EnrollmentRecord {
  salon: string;
  motivoCierre: string | null;
  createdAt: Date;
}

export async function historialPorNino(childPersonId: string): Promise<EnrollmentHistoryItem[]> {
  return queryRows<EnrollmentHistoryItem>(
    `SELECT e.id, e.contract_id AS "contractId", e.child_person_id AS "childPersonId",
            e.classroom_id AS "classroomId", e.estado, e.motivo_cierre AS "motivoCierre",
            e.created_at AS "createdAt", cl.nombre AS salon
       FROM enrollment_enrollment e
       JOIN scheduling_classroom cl ON cl.id = e.classroom_id
      WHERE e.child_person_id = $1
      ORDER BY e.created_at DESC`,
    [childPersonId],
  );
}
