/**
 * EL PUESTO DE UNA CLASE EN SU SALÓN (2026-10-03).
 *
 * La lección de una sesión es la del puesto que ocupa entre las CLASES
 * REGULARES del salón (tipo SESION, nacidas de un slot), en orden
 * cronológico. Ni los clubes ni los eventos sueltos ni los refuerzos (sin
 * slot) cuentan: no dictan lección del programa.
 *
 * Se deriva del instante y no del `numero` guardado porque hasta 2026-10-03 la
 * generación numeraba clases y clubes en una sola cuenta, y los salones ya
 * creados conservan esa numeración hasta que se regeneren. El puesto
 * derivado vale para los dos.
 *
 * Tabla derivada `(session_id, n)`; se cruza por `session_id`. Quien la use
 * puede acotarla con `WHERE` sobre el salón en su propia consulta.
 */
export const SQL_ORDINAL_CLASE = `(
  SELECT os.id AS session_id,
         ROW_NUMBER() OVER (PARTITION BY os.classroom_id ORDER BY os.starts_at) AS n
    FROM scheduling_session os
   WHERE os.tipo = 'SESION' AND os.slot_id IS NOT NULL
)`;
