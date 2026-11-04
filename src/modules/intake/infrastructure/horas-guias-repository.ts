import { queryRows } from "@/platform/db/query";

/**
 * Lectura para la liquidación de horas de guías en LGS (Administración › Gestión
 * Advisors). Una fila por sesión YA OCURRIDA en el rango (fecha operativa del
 * salón), con la guía asignada al salón y los inscritos / presentes por país del
 * contrato del niño. Solo lectura.
 *
 * Inscritos = matrículas ACTIVAS del salón (la lista de la sesión se deriva de
 * ellas — regla de cohortes). Presentes = asistencias PRESENTE de la sesión.
 */
export interface SesionGuiaRow {
  id: string;
  fecha: string;
  startsAt: string;
  duracionMin: number;
  classroomId: string;
  salon: string;
  holidayCountry: string;
  tipoCurso: string;
  guiaUserId: string | null;
  guiaUsername: string | null;
  inscritos: Record<string, number>;
  presentes: Record<string, number>;
  marcadas: number;
}

export async function listarSesionesGuias(desde: string, hasta: string): Promise<SesionGuiaRow[]> {
  return queryRows<SesionGuiaRow>(
    `WITH ses AS (
       SELECT s.id, s.fecha, s.starts_at, s.duracion_min, s.classroom_id,
              cl.nombre AS salon, cl.holiday_country, cl.guia_user_id, co.tipo AS tipo_curso
         FROM scheduling_session s
         JOIN scheduling_classroom cl ON cl.id = s.classroom_id
         JOIN catalog_course co ON co.id = cl.course_id
        WHERE s.fecha >= $1::date AND s.fecha <= $2::date AND s.starts_at <= NOW()
     ),
     insc AS (
       SELECT e.classroom_id, COALESCE(ct.country_code, p.country_code) AS pais, COUNT(*)::int AS n
         FROM enrollment_enrollment e
         JOIN people_person p ON p.id = e.child_person_id
         LEFT JOIN contracts_contract ct ON ct.id = e.contract_id
        WHERE e.estado = 'ACTIVA' AND e.classroom_id IN (SELECT DISTINCT classroom_id FROM ses)
        GROUP BY 1, 2
     ),
     pres AS (
       SELECT a.session_id,
              COALESCE(ct.country_code, p.country_code) AS pais,
              COUNT(*) FILTER (WHERE a.estado = 'PRESENTE')::int AS n,
              COUNT(*)::int AS marcadas
         FROM attendance_attendance a
         JOIN ses ON ses.id = a.session_id
         JOIN people_person p ON p.id = a.child_person_id
         LEFT JOIN LATERAL (
           SELECT c.country_code FROM enrollment_enrollment e
             JOIN contracts_contract c ON c.id = e.contract_id
            WHERE e.child_person_id = a.child_person_id AND e.classroom_id = ses.classroom_id
            ORDER BY e.created_at DESC LIMIT 1
         ) ct ON true
        GROUP BY 1, 2
     )
     SELECT ses.id, TO_CHAR(ses.fecha, 'YYYY-MM-DD') AS fecha, ses.starts_at AS "startsAt",
            ses.duracion_min AS "duracionMin", ses.classroom_id AS "classroomId", ses.salon,
            ses.holiday_country AS "holidayCountry", ses.tipo_curso AS "tipoCurso",
            ses.guia_user_id AS "guiaUserId", u.username AS "guiaUsername",
            COALESCE((SELECT jsonb_object_agg(i.pais, i.n) FROM insc i WHERE i.classroom_id = ses.classroom_id), '{}'::jsonb) AS inscritos,
            COALESCE((SELECT jsonb_object_agg(pr.pais, pr.n) FROM pres pr WHERE pr.session_id = ses.id), '{}'::jsonb) AS presentes,
            COALESCE((SELECT SUM(pr.marcadas) FROM pres pr WHERE pr.session_id = ses.id), 0)::int AS marcadas
       FROM ses
       LEFT JOIN identity_user u ON u.id = ses.guia_user_id
      ORDER BY ses.starts_at`,
    [desde, hasta],
  );
}
