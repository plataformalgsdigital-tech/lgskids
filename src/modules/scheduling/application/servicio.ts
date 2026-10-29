import { queryRows } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import { JOIN_NOMBRE_GUIA, NOMBRE_GUIA } from "../infrastructure/scheduling-repository";
import { SQL_SESION_CANCELADA } from "./cancelacion";

/**
 * Consultas de SERVICIO (2026-10-14) sobre el calendario: qué pasó con las
 * sesiones de un rango de días, y quiénes asistieron a su Welcome.
 * Las dos son listas de trabajo: rango acotado y tope de filas.
 */

export const DIAS_MAX = 93;
const MAX_FILAS = 2000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function validarRango(desde: string, hasta: string): void {
  if (!FECHA.test(desde) || !FECHA.test(hasta)) {
    throw new ValidationError("Las fechas deben ser YYYY-MM-DD.");
  }
  if (desde > hasta)
    throw new ValidationError("La fecha inicial no puede ser posterior a la final.");
  if ((Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > DIAS_MAX) {
    throw new ValidationError(`El rango es de hasta ${String(DIAS_MAX)} días.`);
  }
}

// —— Sesiones ————————————————————————————————————————————————————————————

/**
 * Lo que pasó con la sesión, en el vocabulario de servicio:
 *  - REALIZADA: el guía la registró (cerrada).
 *  - NO_REALIZADA: ya terminó y nadie la registró.
 *  - CANCELADA: el guía avisó y administración la canceló SIN reemplazo.
 *  - SUSPENDIDA: administración suspendió el día del salón (se corrió al final).
 *  - PROGRAMADA: todavía no termina.
 */
export type EstadoSesionServicio =
  "REALIZADA" | "NO_REALIZADA" | "CANCELADA" | "SUSPENDIDA" | "PROGRAMADA";

export interface SesionServicio {
  /** Única por fila: el id de la sesión, o el de la suspensión. */
  clave: string;
  sessionId: string | null;
  fecha: string;
  /** Hora de pared del salón; NULL en un día suspendido (la sesión ya no existe). */
  hora: string | null;
  tipo: string | null;
  campania: string | null;
  curso: string | null;
  salon: string;
  pais: string;
  guia: string | null;
  estado: EstadoSesionServicio;
  /** Motivo de la suspensión o de la cancelación, o nota del registro. */
  detalle: string | null;
  /** Si el guía avisó cancelación: quién, y si alguien lo cubrió. */
  canceloGuia: string | null;
  cubiertaPor: string | null;
  cancelacionPendiente: boolean;
  presentes: number;
  ausentes: number;
  justificados: number;
}

export async function sesionesServicio(f: {
  countryScope: string[] | null;
  desde: string;
  hasta: string;
  campaignId?: string | null;
  curso?: string | null;
  classroomId?: string | null;
  estado?: EstadoSesionServicio | null;
}): Promise<SesionServicio[]> {
  validarRango(f.desde, f.hasta);
  const values: unknown[] = [f.desde, f.hasta, f.countryScope];
  const cond: string[] = [];
  const agregar = (sql: (n: string) => string, valor: unknown) => {
    values.push(valor);
    cond.push(sql(`$${String(values.length)}`));
  };
  if (f.campaignId != null && f.campaignId !== "") agregar((n) => `ca.id = ${n}`, f.campaignId);
  if (f.curso != null && f.curso !== "") agregar((n) => `co.tipo::text = ${n}`, f.curso);
  if (f.classroomId != null && f.classroomId !== "") {
    agregar((n) => `cl.id = ${n}`, f.classroomId);
  }
  const filtro = cond.map((c) => `AND ${c}`).join(" ");
  let porEstado = "";
  if (f.estado != null) {
    values.push(f.estado);
    porEstado = `WHERE x.estado = $${String(values.length)}`;
  }
  values.push(MAX_FILAS);

  return queryRows<SesionServicio>(
    `SELECT * FROM (
       SELECT s.id::text AS clave, s.id AS "sessionId", s.fecha::text AS fecha,
              to_char(s.starts_at AT TIME ZONE cl.timezone, 'HH24:MI') AS hora,
              s.tipo::text AS tipo, ca.nombre AS campania, co.tipo::text AS curso,
              cl.nombre AS salon, cl.holiday_country AS pais, ${NOMBRE_GUIA} AS guia,
              CASE WHEN s.suspendida_en IS NOT NULL THEN 'SUSPENDIDA'
                   WHEN ${SQL_SESION_CANCELADA("s")} THEN 'CANCELADA'
                   WHEN s.cerrada_en IS NOT NULL THEN 'REALIZADA'
                   WHEN s.starts_at + make_interval(mins => s.duracion_min) > now() THEN 'PROGRAMADA'
                   ELSE 'NO_REALIZADA' END AS estado,
              CASE WHEN s.suspendida_en IS NOT NULL THEN s.suspension_motivo
                   WHEN cx.id IS NOT NULL THEN cx.motivo ELSE s.nota_sesion END AS detalle,
              CASE WHEN cx.id IS NULL THEN NULL ELSE
                (SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', g2.nombres, g2.apellidos)), ''), u2.username)
                   FROM identity_user u2 LEFT JOIN scheduling_guia g2 ON g2.guia_user_id = u2.id
                  WHERE u2.id = cx.guia_user_id) END AS "canceloGuia",
              CASE WHEN cx.reemplazo_guia_user_id IS NULL THEN NULL ELSE ${NOMBRE_GUIA} END
                AS "cubiertaPor",
              COALESCE(cx.estado = 'PENDIENTE', false) AS "cancelacionPendiente",
              (SELECT count(*) FROM attendance_attendance a
                WHERE a.session_id = s.id AND a.estado = 'PRESENTE')::int AS presentes,
              (SELECT count(*) FROM attendance_attendance a
                WHERE a.session_id = s.id AND a.estado = 'AUSENTE')::int AS ausentes,
              (SELECT count(*) FROM attendance_attendance a
                WHERE a.session_id = s.id AND a.estado = 'JUSTIFICADO')::int AS justificados,
              s.starts_at AS orden
         FROM scheduling_session s
         JOIN scheduling_classroom cl ON cl.id = s.classroom_id
         LEFT JOIN catalog_course co ON co.id = cl.course_id
         LEFT JOIN catalog_campaign ca ON ca.id = co.campaign_id
         LEFT JOIN identity_user gu ON gu.id = COALESCE(s.guia_user_id, cl.guia_user_id)
         ${JOIN_NOMBRE_GUIA}
         LEFT JOIN LATERAL (
              SELECT c.* FROM scheduling_cancelacion c
               WHERE c.session_id = s.id AND c.estado IN ('PENDIENTE', 'APROBADA')
               ORDER BY c.created_at DESC LIMIT 1) cx ON true
        WHERE s.fecha BETWEEN $1::date AND $2::date
          AND ($3::text[] IS NULL OR cl.holiday_country = ANY($3::text[]))
          ${filtro}
       UNION ALL
       -- Un día SUSPENDIDO ya no tiene sesión (se corrió al final del curso):
       -- se lee de la tabla de suspensiones, que es la que lo recuerda.
       SELECT sp.id::text, NULL, sp.fecha::text, NULL, NULL, ca.nombre, co.tipo::text,
              cl.nombre, cl.holiday_country, ${NOMBRE_GUIA}, 'SUSPENDIDA', sp.motivo,
              NULL, NULL, false, 0, 0, 0,
              (sp.fecha::timestamp AT TIME ZONE cl.timezone)
         FROM scheduling_suspension sp
         JOIN scheduling_classroom cl ON cl.id = sp.classroom_id
         LEFT JOIN catalog_course co ON co.id = cl.course_id
         LEFT JOIN catalog_campaign ca ON ca.id = co.campaign_id
         LEFT JOIN identity_user gu ON gu.id = cl.guia_user_id
         ${JOIN_NOMBRE_GUIA}
        WHERE sp.fecha BETWEEN $1::date AND $2::date
          AND ($3::text[] IS NULL OR cl.holiday_country = ANY($3::text[]))
          ${filtro}
     ) x
     ${porEstado}
     ORDER BY x.fecha DESC, x.orden, x.salon
     LIMIT $${String(values.length)}`,
    values,
  );
}
