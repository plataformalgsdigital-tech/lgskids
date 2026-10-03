import { SQL_SECUENCIA_LECCIONES } from "@/modules/catalog";
import { SQL_ORDINAL_CLASE } from "@/modules/scheduling";
import { queryOne, queryRows } from "@/platform/db/query";

/**
 * Lecturas del ACADEMIC CHANGE (ficha del niño): dónde está, a qué salones
 * puede ir y en qué punto del programa va cada uno.
 */

export interface PosicionActual {
  contractId: string;
  childPersonId: string;
  tipoCurso: string;
  contratoEstado: string;
  enrollmentId: string | null;
  classroomId: string | null;
  salon: string | null;
  courseId: string | null;
  campania: string | null;
}

export async function getPosicionActual(contractId: string): Promise<PosicionActual | null> {
  return queryOne<PosicionActual>(
    `SELECT c.id AS "contractId", c.beneficiario_id AS "childPersonId",
            c.tipo_curso::text AS "tipoCurso", c.estado::text AS "contratoEstado",
            e.id AS "enrollmentId", cl.id AS "classroomId", cl.nombre AS salon,
            cl.course_id AS "courseId", ca.nombre AS campania
       FROM contracts_contract c
       LEFT JOIN enrollment_enrollment e ON e.contract_id = c.id AND e.estado = 'ACTIVA'
       LEFT JOIN scheduling_classroom cl ON cl.id = e.classroom_id
       LEFT JOIN catalog_course co ON co.id = cl.course_id
       LEFT JOIN catalog_campaign ca ON ca.id = co.campaign_id
      WHERE c.id = $1`,
    [contractId],
  );
}

export interface SalonCandidato {
  id: string;
  nombre: string;
  tipo: string;
  courseId: string;
  campania: string;
  cupo: number;
  ocupados: number;
  guia: string | null;
  /** Punto del programa en que va el salón: su última clase ya empezada. */
  puntoNivel: string | null;
  puntoPos: number | null;
  puntoTotal: number | null;
}

/**
 * Salones ACTIVOS de campañas que no han terminado, con su ocupación y el
 * punto en que van. El punto sale de la MISMA regla del calendario: la última
 * clase regular empezada y la lección que le toca.
 */
export async function listSalonesCandidatos(): Promise<SalonCandidato[]> {
  return queryRows<SalonCandidato>(
    `WITH ord AS ${SQL_ORDINAL_CLASE}, sec AS ${SQL_SECUENCIA_LECCIONES}
     SELECT cl.id, cl.nombre, co.tipo::text AS tipo, co.id AS "courseId",
            ca.nombre AS campania, cl.cupo,
            (SELECT count(*)::int FROM enrollment_enrollment e
              WHERE e.classroom_id = cl.id AND e.estado IN ('ACTIVA', 'RESERVADA')) AS ocupados,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', gg.nombres, gg.apellidos)), ''), g.username) AS guia,
            pt.nivel AS "puntoNivel", pt.pos::int AS "puntoPos", pt.total::int AS "puntoTotal"
       FROM scheduling_classroom cl
       JOIN catalog_course co ON co.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = co.campaign_id
       LEFT JOIN identity_user g ON g.id = cl.guia_user_id
       LEFT JOIN scheduling_guia gg ON gg.guia_user_id = g.id
       LEFT JOIN LATERAL (
         SELECT sec.nivel, sec.pos, sec.total
           FROM scheduling_session s
           JOIN ord ON ord.session_id = s.id
           JOIN sec ON sec.curso = co.tipo AND sec.n = ord.n
          WHERE s.classroom_id = cl.id AND s.starts_at <= now()
          ORDER BY s.starts_at DESC
          LIMIT 1
       ) pt ON true
      WHERE cl.activo AND ca.fin >= CURRENT_DATE
      ORDER BY ca.inicio DESC, co.tipo, cl.nombre`,
  );
}

export interface NivelDeCurso {
  id: string;
  courseId: string;
  codigo: string;
  nombre: string;
  orden: number;
  totalLecciones: number;
}

export async function listNivelesDeCursos(courseIds: string[]): Promise<NivelDeCurso[]> {
  if (courseIds.length === 0) return [];
  return queryRows<NivelDeCurso>(
    `SELECT n.id, n.course_id AS "courseId", n.codigo, n.nombre, n.orden,
            (SELECT count(*)::int FROM catalog_quiz q
              WHERE q.level_id = n.id AND q.tipo::text <> 'LEVEL_UP') AS "totalLecciones"
       FROM catalog_level n
      WHERE n.course_id = ANY($1::uuid[])
      ORDER BY n.course_id, n.orden`,
    [courseIds],
  );
}
