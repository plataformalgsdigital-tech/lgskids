import { queryOne, queryRows } from "@/platform/db/query";

/** Resumen de asistencia y agenda del propio niño (para su panel). */

export interface ResumenAsistencia {
  asistidas: number;
  ausentes: number;
  justificadas: number;
  totalSesiones: number;
}

export interface EventoAgenda {
  sessionId: string;
  tipo: string;
  fecha: string;
  startsAt: Date;
  duracionMin: number;
  guia: string | null;
}

export async function resumenAsistencia(
  childPersonId: string,
  classroomId: string,
): Promise<ResumenAsistencia> {
  const row = await queryOne<{
    asistidas: string;
    ausentes: string;
    justificadas: string;
    total: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE a.estado = 'PRESENTE')::text AS asistidas,
       count(*) FILTER (WHERE a.estado = 'AUSENTE')::text AS ausentes,
       count(*) FILTER (WHERE a.estado = 'JUSTIFICADO')::text AS justificadas,
       (SELECT count(*) FROM scheduling_session WHERE classroom_id = $2)::text AS total
     FROM attendance_attendance a
    WHERE a.child_person_id = $1`,
    [childPersonId, classroomId],
  );
  return {
    asistidas: Number(row?.asistidas ?? 0),
    ausentes: Number(row?.ausentes ?? 0),
    justificadas: Number(row?.justificadas ?? 0),
    totalSesiones: Number(row?.total ?? 0),
  };
}

export interface ClaseHistorial {
  sessionId: string;
  tipo: string;
  fecha: string;
  numero: number;
  estado: "PRESENTE" | "AUSENTE" | "JUSTIFICADO" | null;
}

/** Historial de clases YA dictadas del salón, con la marca del niño (o null). */
export async function historialAsistencia(
  childPersonId: string,
  classroomId: string,
  limit = 30,
): Promise<ClaseHistorial[]> {
  return queryRows<ClaseHistorial>(
    `SELECT s.id AS "sessionId", s.tipo::text AS tipo, s.fecha::text AS fecha, s.numero,
            a.estado::text AS estado
       FROM scheduling_session s
       LEFT JOIN attendance_attendance a
         ON a.session_id = s.id AND a.child_person_id = $1
      WHERE s.classroom_id = $2 AND s.starts_at < now()
      ORDER BY s.starts_at DESC
      LIMIT $3`,
    [childPersonId, classroomId, limit],
  );
}

/** Próximas sesiones del salón (agenda del niño), con el guía. */
export async function agendaProximas(classroomId: string, limit = 8): Promise<EventoAgenda[]> {
  return queryRows<EventoAgenda>(
    `SELECT s.id AS "sessionId", s.tipo::text AS tipo, s.fecha::text AS fecha,
            s.starts_at AS "startsAt", s.duracion_min AS "duracionMin",
            COALESCE(gp.nombres || ' ' || gp.apellidos, gu.username) AS guia
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       LEFT JOIN identity_user gu ON gu.id = cl.guia_user_id
       LEFT JOIN people_person gp ON gp.user_id = gu.id
      WHERE s.classroom_id = $1 AND s.starts_at >= now()
      ORDER BY s.starts_at
      LIMIT $2`,
    [classroomId, limit],
  );
}
