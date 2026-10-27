import { SQL_LINK_CLUB } from "@/modules/scheduling";
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
  /** Sala de Zoom del guía de ESA sesión; si no tiene, la del salón. */
  meetingUrl: string | null;
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
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', gg.nombres, gg.apellidos)), ''),
                     NULLIF(TRIM(CONCAT_WS(' ', gpf.nombres, gpf.apellidos)), ''),
                     u.username, cl.nombre) AS guia,
            a.comentario_usuario AS comentario
       FROM attendance_attendance a
       JOIN scheduling_session s ON s.id = a.session_id
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       LEFT JOIN identity_user u ON u.id = COALESCE(s.guia_user_id, cl.guia_user_id)
       LEFT JOIN scheduling_guia gg ON gg.guia_user_id = u.id
       LEFT JOIN identity_perfil gpf ON gpf.user_id = u.id
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
 * —por defecto las DOS SEMANAS siguientes—, con el guía, desde la que está EN
 * CURSO (la que aún no termina, como la "Siguiente clase" de la ficha). Incluye TODOS los
 * tipos (sesiones y clubes/talleres); no filtra por tipo.
 */
export async function agendaProximas(
  classroomId: string,
  dias = 14,
  /** Con el niño, suma lo que se le AGENDÓ en otros salones (Academic management). */
  childPersonId?: string,
): Promise<EventoAgenda[]> {
  return queryRows<EventoAgenda>(
    `SELECT s.id AS "sessionId", s.tipo::text AS tipo, s.fecha::text AS fecha,
            s.starts_at AS "startsAt", s.duracion_min AS "duracionMin",
            s.observaciones, s.nivel, (s.slot_id IS NULL) AS "esEvento",
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', gg.nombres, gg.apellidos)), ''),
                     NULLIF(TRIM(CONCAT_WS(' ', gp.nombres, gp.apellidos)), ''),
                     gu.username) AS guia,
            -- El link propio del Club; si no, la sala del guía de ESA sesión (un
            -- reemplazo dicta desde la suya) y, si no, la del salón.
            COALESCE(${SQL_LINK_CLUB("s")}, NULLIF(TRIM(gg.zoom_url), ''), cl.meeting_url)
              AS "meetingUrl"
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       -- El guía de la SESIÓN (reemplazo de un día, evento suelto) y, si no
       -- tiene, el del salón. Su nombre vive en su ficha de guía, no en la cuenta.
       LEFT JOIN identity_user gu ON gu.id = COALESCE(s.guia_user_id, cl.guia_user_id)
       LEFT JOIN scheduling_guia gg ON gg.guia_user_id = gu.id
       LEFT JOIN people_person gp ON gp.user_id = gu.id
      WHERE (s.classroom_id = $1
             OR EXISTS (SELECT 1 FROM scheduling_agendado a
                         WHERE a.child_person_id = $3 AND a.estado = 'ACTIVA'
                           AND a.classroom_id = s.classroom_id AND a.starts_at = s.starts_at))
        -- La que está EN CURSO sigue en la agenda hasta que termina: la ventana
        -- de Zoom permite entrar y reconectarse con la clase empezada, y
        -- quitarla al empezar dejaba al niño sin el enlace en plena clase.
        AND s.starts_at + make_interval(mins => s.duracion_min) > now()
        AND s.starts_at < now() + ($2 || ' days')::interval
      ORDER BY s.starts_at
      LIMIT 60`,
    [classroomId, String(dias), childPersonId ?? null],
  );
}
