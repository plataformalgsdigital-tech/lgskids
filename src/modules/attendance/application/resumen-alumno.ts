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
  /** Lo que se escribió al crearlo a mano; en las generadas viene vacío. */
  observaciones: string | null;
  nivel: string | null;
  /**
   * Creado A MANO desde el calendario (sin slot): un club puntual, un taller o
   * un refuerzo. Lo que el negocio llama "evento", frente a la clase que nace
   * del horario recurrente del salón.
   */
  esEvento: boolean;
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

export interface ComentarioGuia {
  sessionId: string;
  fecha: string;
  tipo: string;
  numero: number;
  guia: string | null;
  comentario: string;
}

/**
 * Comentarios que el guía escribió PARA EL ALUMNO en sus sesiones, del más
 * reciente al más antiguo.
 *
 * Devuelve SOLO `comentario_usuario`. La `nota_privada` de la misma fila es
 * del equipo y NUNCA sale por aquí: este dato viaja al panel del niño.
 */
export async function comentariosDeGuia(
  childPersonId: string,
  limit = 20,
): Promise<ComentarioGuia[]> {
  return queryRows<ComentarioGuia>(
    `SELECT s.id AS "sessionId", s.fecha::text AS fecha, s.tipo::text AS tipo, s.numero,
            COALESCE(u.username, cl.nombre) AS guia,
            a.comentario_usuario AS comentario
       FROM attendance_attendance a
       JOIN scheduling_session s ON s.id = a.session_id
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       LEFT JOIN identity_user u ON u.id = COALESCE(s.guia_user_id, cl.guia_user_id)
      WHERE a.child_person_id = $1
        AND a.comentario_usuario IS NOT NULL
        AND TRIM(a.comentario_usuario) <> ''
      ORDER BY s.starts_at DESC
      LIMIT $2`,
    [childPersonId, limit],
  );
}

/**
 * Próximas sesiones del salón (agenda del niño) dentro de una ventana de días
 * —por defecto las DOS SEMANAS siguientes—, con el guía. Incluye TODOS los
 * tipos (sesiones y clubes/talleres); no filtra por tipo.
 */
export async function agendaProximas(classroomId: string, dias = 14): Promise<EventoAgenda[]> {
  return queryRows<EventoAgenda>(
    `SELECT s.id AS "sessionId", s.tipo::text AS tipo, s.fecha::text AS fecha,
            s.starts_at AS "startsAt", s.duracion_min AS "duracionMin",
            s.observaciones, s.nivel, (s.slot_id IS NULL) AS "esEvento",
            COALESCE(gp.nombres || ' ' || gp.apellidos, gu.username) AS guia
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       LEFT JOIN identity_user gu ON gu.id = cl.guia_user_id
       LEFT JOIN people_person gp ON gp.user_id = gu.id
      WHERE s.classroom_id = $1
        AND s.starts_at >= now()
        AND s.starts_at < now() + ($2 || ' days')::interval
      ORDER BY s.starts_at
      LIMIT 60`,
    [classroomId, String(dias)],
  );
}
