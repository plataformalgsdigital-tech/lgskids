import { queryRows } from "@/platform/db/query";
import { JOIN_NOMBRE_GUIA, NOMBRE_GUIA } from "../infrastructure/scheduling-repository";

/**
 * COLISIONES de una campaña (2026-10-13): un mismo guía con dos salones cuyas
 * sesiones se PISAN en el tiempo. Sale de las sesiones FUTURAS, con el guía
 * EFECTIVO de cada una (el reemplazo de un día manda sobre el del salón).
 *
 * Basta con que UNO de los dos salones sea de la campaña: el choque con un
 * salón de otra campaña también le quita el guía a esta.
 *
 * `mismoCurso`: si los dos salones son del mismo curso (Junior con Junior,
 * Youngster con Youngster). El negocio decidirá si en ese caso el guía puede
 * dictarlos juntos; entre cursos distintos no.
 */

export interface Colision {
  guiaUserId: string;
  guia: string;
  salonA: string;
  campaniaA: string;
  cursoA: string;
  salonB: string;
  campaniaB: string;
  cursoB: string;
  mismoCurso: boolean;
  /** Sesiones futuras que se pisan. */
  choques: number;
  /** La próxima vez que chocan (instante de la sesión del salón A). */
  proximo: string;
  /** Zona del salón A, para mostrar el horario del choque. */
  timezone: string;
}

export async function colisionesDeCampania(campaignId: string): Promise<Colision[]> {
  return queryRows<Colision>(
    `WITH s AS (
       SELECT s.id, s.classroom_id, s.starts_at,
              s.starts_at + make_interval(mins => s.duracion_min) AS ends_at,
              COALESCE(s.guia_user_id, cl.guia_user_id) AS guia,
              cl.nombre AS salon, cl.timezone, co.tipo::text AS curso,
              co.campaign_id, ca.nombre AS campania
         FROM scheduling_session s
         JOIN scheduling_classroom cl ON cl.id = s.classroom_id
         JOIN catalog_course co ON co.id = cl.course_id
         JOIN catalog_campaign ca ON ca.id = co.campaign_id
        WHERE cl.activo AND s.starts_at >= now()
          AND COALESCE(s.guia_user_id, cl.guia_user_id) IS NOT NULL
     )
     SELECT a.guia AS "guiaUserId", ${NOMBRE_GUIA} AS guia,
            a.salon AS "salonA", a.campania AS "campaniaA", a.curso AS "cursoA",
            b.salon AS "salonB", b.campania AS "campaniaB", b.curso AS "cursoB",
            (a.curso = b.curso) AS "mismoCurso",
            count(*)::int AS choques, min(a.starts_at) AS proximo,
            min(a.timezone) AS timezone
       FROM s a
       JOIN s b ON b.guia = a.guia AND b.classroom_id > a.classroom_id
               AND a.starts_at < b.ends_at AND b.starts_at < a.ends_at
       JOIN identity_user gu ON gu.id = a.guia
       ${JOIN_NOMBRE_GUIA}
      WHERE a.campaign_id = $1 OR b.campaign_id = $1
      GROUP BY a.guia, gu.username, gg.nombres, gg.apellidos, gpf.nombres, gpf.apellidos,
               gp.nombres, gp.apellidos, a.classroom_id, b.classroom_id,
               a.salon, a.campania, a.curso, b.salon, b.campania, b.curso
      ORDER BY guia, proximo`,
    [campaignId],
  );
}
