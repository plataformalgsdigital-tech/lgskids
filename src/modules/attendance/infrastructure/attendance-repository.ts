import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";

type Queryable = Pick<PoolClient, "query">;

export interface SessionInfo {
  id: string;
  classroomId: string;
  courseId: string;
  salon: string;
  tipo: string;
  fecha: string;
  startsAt: Date;
  numero: number;
}

export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  return queryOne<SessionInfo>(
    `SELECT s.id, s.classroom_id AS "classroomId", cl.course_id AS "courseId",
            cl.nombre AS salon, s.tipo::text AS tipo, s.fecha::text AS fecha,
            s.starts_at AS "startsAt", s.numero
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE s.id = $1`,
    [sessionId],
  );
}

export interface RosterConPais {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  username: string | null;
  paisContrato: string;
}

/** Roster DERIVADO de matrículas activas, con el país del contrato de cada niño. */
export async function getRosterConPais(classroomId: string): Promise<RosterConPais[]> {
  return queryRows<RosterConPais>(
    `SELECT p.id AS "childPersonId", p.nombres, p.apellidos, u.username,
            c.country_code AS "paisContrato"
       FROM enrollment_enrollment e
       JOIN people_person p ON p.id = e.child_person_id
       JOIN contracts_contract c ON c.id = e.contract_id
       LEFT JOIN identity_user u ON u.id = p.user_id
      WHERE e.classroom_id = $1 AND e.estado = 'ACTIVA'
      ORDER BY p.apellidos, p.nombres`,
    [classroomId],
  );
}

/** Países (de la lista dada) que tienen feriado en la fecha. */
export async function paisesConFeriado(fecha: string, paises: string[]): Promise<Set<string>> {
  if (paises.length === 0) return new Set();
  const rows = await queryRows<{ country_code: string }>(
    `SELECT country_code FROM scheduling_holiday
      WHERE fecha = $1::date AND country_code = ANY($2)`,
    [fecha, paises],
  );
  return new Set(rows.map((r) => r.country_code));
}

export interface MarcaExistente {
  childPersonId: string;
  estado: string;
  justificacion: string | null;
}

export async function getMarcasDeSesion(sessionId: string): Promise<MarcaExistente[]> {
  return queryRows<MarcaExistente>(
    `SELECT child_person_id AS "childPersonId", estado::text AS estado, justificacion
       FROM attendance_attendance WHERE session_id = $1`,
    [sessionId],
  );
}

/** UPSERT: re-marcar actualiza la marca existente. */
export async function upsertMarca(
  tx: Queryable,
  input: {
    sessionId: string;
    childPersonId: string;
    estado: string;
    justificacion: string | null;
    marcadoPor: string;
  },
): Promise<void> {
  await execute(
    `INSERT INTO attendance_attendance
       (id, session_id, child_person_id, estado, justificacion, marcado_por, updated_at)
     VALUES ($1, $2, $3, $4::attendance_estado, $5, $6, now())
     ON CONFLICT (session_id, child_person_id) DO UPDATE
        SET estado = $4::attendance_estado, justificacion = $5,
            marcado_por = $6, updated_at = now()`,
    [
      newId(),
      input.sessionId,
      input.childPersonId,
      input.estado,
      input.justificacion,
      input.marcadoPor,
    ],
    tx,
  );
}
