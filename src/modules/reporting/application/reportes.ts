import { queryRows } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";

/**
 * Reportes con agrupación temporal SIEMPRE en SQL con AT TIME ZONE anclado
 * a la zona operativa DEL SALÓN (ADR-0007) — jamás en JS con la zona del
 * cliente (el peor bug de LGS: las sesiones de la tarde-noche desaparecían
 * de los reportes mensuales).
 */

export interface AsistenciaSalonMes {
  salon: string;
  campania: string;
  timezone: string;
  sesionesDelMes: number;
  presentes: number;
  ausentes: number;
  justificados: number;
  porcentajeAsistencia: number | null;
}

/** Asistencia por salón en un mes operativo (YYYY-MM), en la zona de CADA salón. */
export async function asistenciaPorSalonMes(mes: string): Promise<AsistenciaSalonMes[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new ValidationError("El mes debe ser YYYY-MM.");
  }
  return queryRows<AsistenciaSalonMes>(
    `SELECT cl.nombre AS salon, ca.nombre AS campania, cl.timezone,
            count(DISTINCT s.id)::int AS "sesionesDelMes",
            count(*) FILTER (WHERE a.estado = 'PRESENTE')::int AS presentes,
            count(*) FILTER (WHERE a.estado = 'AUSENTE')::int AS ausentes,
            count(*) FILTER (WHERE a.estado = 'JUSTIFICADO')::int AS justificados,
            CASE WHEN count(a.id) > 0
                 THEN round(100.0 * count(*) FILTER (WHERE a.estado = 'PRESENTE') / count(a.id))::int
            END AS "porcentajeAsistencia"
       FROM scheduling_classroom cl
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       JOIN scheduling_session s ON s.classroom_id = cl.id
        AND to_char(s.starts_at AT TIME ZONE cl.timezone, 'YYYY-MM') = $1
       LEFT JOIN attendance_attendance a ON a.session_id = s.id
      GROUP BY cl.id, ca.nombre
      ORDER BY ca.nombre, cl.nombre`,
    [mes],
  );
}

export interface OcupacionSalon {
  salon: string;
  campania: string;
  curso: string;
  cupo: number;
  matriculados: number;
  disponibles: number;
}

/** Ocupación: cupo vs matrículas activas por salón. */
export async function ocupacionSalones(): Promise<OcupacionSalon[]> {
  return queryRows<OcupacionSalon>(
    `SELECT cl.nombre AS salon, ca.nombre AS campania, cu.tipo::text AS curso,
            cl.cupo,
            count(e.id)::int AS matriculados,
            (cl.cupo - count(e.id))::int AS disponibles
       FROM scheduling_classroom cl
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN enrollment_enrollment e
         ON e.classroom_id = cl.id AND e.estado = 'ACTIVA'
      WHERE cl.activo = true
      GROUP BY cl.id, ca.nombre, cu.tipo
      ORDER BY ca.nombre, cl.nombre`,
  );
}

export interface ContratosPais {
  pais: string;
  pendientes: number;
  aprobados: number;
  enPausa: number;
  inactivos: number;
  porVencer30d: number;
}

/** Contratos por país y estado, con alcance por país del solicitante. */
export async function contratosPorPais(countryScope: string[] | null): Promise<ContratosPais[]> {
  const values: unknown[] = [];
  let where = "";
  if (countryScope !== null) {
    values.push(countryScope);
    where = `WHERE country_code = ANY($1)`;
  }
  return queryRows<ContratosPais>(
    `SELECT country_code AS pais,
            count(*) FILTER (WHERE estado = 'PENDIENTE')::int AS pendientes,
            count(*) FILTER (WHERE estado = 'APROBADO')::int AS aprobados,
            count(*) FILTER (WHERE estado = 'ONHOLD')::int AS "enPausa",
            count(*) FILTER (WHERE estado = 'INACTIVO')::int AS inactivos,
            count(*) FILTER (
              WHERE estado = 'APROBADO'
                AND final_contrato <= (now() AT TIME ZONE 'UTC')::date + 30
            )::int AS "porVencer30d"
       FROM contracts_contract
      ${where}
      GROUP BY country_code
      ORDER BY country_code`,
    values,
  );
}
