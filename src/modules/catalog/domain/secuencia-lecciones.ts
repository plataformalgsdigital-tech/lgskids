/**
 * EL CATÁLOGO CURSO COMO UNA SOLA SECUENCIA DE LECCIONES (2026-10-03).
 *
 * La sesión N de un salón es la N-ésima lección del catálogo Curso de su tipo,
 * recorrido en el orden de los niveles (Rookie → Ultimate) y luego por
 * `orden`. Es UNA lección por sesión, y se deriva: no hay columna que guarde la
 * lección de una sesión, así que regenerar el salón o corregir el catálogo no
 * deja nada desincronizado.
 *
 * Es SQL porque lo consumen varias consultas (la sesión del calendario, el
 * historial de asistencia del niño, el punto en que va un salón) y tiene que
 * ser la MISMA regla en todas. Se usa como tabla derivada:
 *
 *   LEFT JOIN ${SQL_SECUENCIA_LECCIONES} sec
 *     ON sec.curso = <tipo del curso> AND sec.n = s.numero AND s.numero > 0
 *
 * Columnas: `curso` (enum), `nivel` (código), `leccion` (texto del catálogo),
 * `n` (posición global en el curso), `pos` (posición dentro del nivel) y
 * `total` (lecciones del nivel).
 */
export const SQL_SECUENCIA_LECCIONES = `(
  SELECT cc.curso, cc.nivel, cc.leccion,
         ROW_NUMBER() OVER (
           PARTITION BY cc.curso
           ORDER BY array_position(ARRAY['ROOKIE','CHAMPION','ELITE','LEGENDARY','ULTIMATE']::text[], cc.nivel),
                    cc.orden, cc.leccion
         ) AS n,
         ROW_NUMBER() OVER (PARTITION BY cc.curso, cc.nivel ORDER BY cc.orden, cc.leccion) AS pos,
         COUNT(*) OVER (PARTITION BY cc.curso, cc.nivel) AS total
    FROM catalog_curso cc
)`;
