-- CLUB ÚNICO (2026-10-29). Un Club para "Todos" ya no se copia en cada salón: es
-- UN evento (una sesión por semana) guardado en un salón anfitrión, ABIERTO, con
-- su alcance (campaña, curso, país; NULL = todos) — así lo ven e inscriben los
-- niños de todos los salones que caen en él.
--
-- Une los Clubes que ya se habían creado como copias: los grupos de MÁS de 3
-- salones (un evento compartido elegido a mano admite hasta 3, así que los de más
-- solo pudo crearlos "Todos los salones"), y solo si ninguna copia tiene historia
-- (registro, asistencia o repetición pedida). El alcance se deduce de los salones
-- del grupo: un campo con un solo valor queda fijo; con varios, "Todos".

CREATE TEMP TABLE club_grupo AS
SELECT s.grupo_id,
       (array_agg(s.id ORDER BY cl.nombre, s.id))[1] AS anfitrion,
       CASE WHEN count(DISTINCT co.campaign_id) = 1
            THEN (array_agg(co.campaign_id))[1] END AS campaign_id,
       CASE WHEN count(DISTINCT co.tipo) = 1 THEN min(co.tipo::text) END AS curso,
       CASE WHEN count(DISTINCT cl.holiday_country) = 1
            THEN min(cl.holiday_country::text) END AS pais
  FROM scheduling_session s
  JOIN scheduling_classroom cl ON cl.id = s.classroom_id
  JOIN catalog_course co ON co.id = cl.course_id
 WHERE s.tipo = 'CLUB' AND s.slot_id IS NULL AND s.grupo_id IS NOT NULL
 GROUP BY s.grupo_id
HAVING count(*) > 3
   AND bool_and(s.cerrada_en IS NULL
                AND NOT EXISTS (SELECT 1 FROM attendance_attendance a WHERE a.session_id = s.id)
                AND NOT EXISTS (SELECT 1 FROM scheduling_repeticion r WHERE r.session_id = s.id));

CREATE TEMP TABLE club_copia AS
SELECT s.id, s.classroom_id, s.starts_at, h.id AS anfitrion,
       h.classroom_id AS anfitrion_classroom, h.starts_at AS anfitrion_starts
  FROM club_grupo g
  JOIN scheduling_session s ON s.grupo_id = g.grupo_id AND s.id <> g.anfitrion
  JOIN scheduling_session h ON h.id = g.anfitrion;

-- Los niños inscritos en una copia pasan al anfitrión (si ya estaban ahí, la
-- copia sobra y se cancela).
UPDATE scheduling_agendado a
   SET estado = 'CANCELADA', cancelado_en = now()
  FROM club_copia c
 WHERE a.classroom_id = c.classroom_id AND a.starts_at = c.starts_at AND a.estado = 'ACTIVA'
   AND EXISTS (SELECT 1 FROM scheduling_agendado b
                WHERE b.classroom_id = c.anfitrion_classroom AND b.starts_at = c.anfitrion_starts
                  AND b.child_person_id = a.child_person_id AND b.estado = 'ACTIVA');

UPDATE scheduling_agendado a
   SET classroom_id = c.anfitrion_classroom, starts_at = c.anfitrion_starts
  FROM club_copia c
 WHERE a.classroom_id = c.classroom_id AND a.starts_at = c.starts_at AND a.estado = 'ACTIVA';

UPDATE scheduling_session s
   SET abierto = true, alcance_campaign_id = g.campaign_id, alcance_curso = g.curso,
       alcance_pais = g.pais, alcance_classroom_id = NULL, grupo_id = NULL
  FROM club_grupo g
 WHERE s.id = g.anfitrion;

DELETE FROM scheduling_session s USING club_copia c WHERE s.id = c.id;

DROP TABLE club_copia;
DROP TABLE club_grupo;
