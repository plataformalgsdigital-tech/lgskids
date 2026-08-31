import { execute, queryRows } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";

/**
 * Estadística mensual por guía: ACUMULATIVA y extraíble.
 *
 * Dos piezas deliberadamente separadas:
 *  - `calcularGuiaMes` — la consulta viva, siempre al día, que recomputa desde
 *    sesiones y asistencia.
 *  - `consolidarGuiaMes` — congela ese cálculo en `reporting_guia_mes` con
 *    UPSERT, para que el histórico quede fijo aunque después se regeneren
 *    sesiones (la regeneración de un salón es destructiva y las recrea).
 *
 * El período es 'YYYY-MM' en la zona operativa DEL SALÓN (ADR-0007), no en la
 * del servidor: una sesión de las 20:00 en Chile no debe caer en otro mes.
 */

export interface GuiaMes {
  guiaUserId: string;
  guia: string | null;
  periodo: string;
  sesionesDictadas: number;
  sesionesCerradas: number;
  clubes: number;
  ninosAtendidos: number;
  presentes: number;
  ausentes: number;
  justificados: number;
  casosAtencion: number;
}

function validarPeriodo(periodo: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    throw new ValidationError("El período debe ser YYYY-MM.");
  }
}

/** Cálculo vivo del período, desde las sesiones y sus marcas de asistencia. */
export async function calcularGuiaMes(periodo: string): Promise<GuiaMes[]> {
  validarPeriodo(periodo);
  return queryRows<GuiaMes>(
    `SELECT g.id AS "guiaUserId", g.username AS guia, $1::text AS periodo,
            count(DISTINCT s.id) FILTER (WHERE s.tipo = 'SESION')::int  AS "sesionesDictadas",
            count(DISTINCT s.id) FILTER (WHERE s.cerrada_en IS NOT NULL)::int AS "sesionesCerradas",
            count(DISTINCT s.id) FILTER (WHERE s.tipo = 'CLUB')::int    AS clubes,
            count(DISTINCT a.child_person_id)::int                      AS "ninosAtendidos",
            count(a.*) FILTER (WHERE a.estado = 'PRESENTE')::int         AS presentes,
            count(a.*) FILTER (WHERE a.estado = 'AUSENTE')::int          AS ausentes,
            count(a.*) FILTER (WHERE a.estado = 'JUSTIFICADO')::int      AS justificados,
            count(a.*) FILTER (WHERE a.requiere_atencion)::int           AS "casosAtencion"
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       -- El guía de la sesión manda; si no quedó sellado, el del salón.
       JOIN identity_user g ON g.id = COALESCE(s.guia_user_id, cl.guia_user_id)
       LEFT JOIN attendance_attendance a ON a.session_id = s.id
      WHERE to_char((s.starts_at AT TIME ZONE cl.timezone), 'YYYY-MM') = $1
      GROUP BY g.id, g.username
      ORDER BY g.username`,
    [periodo],
  );
}

/**
 * Congela el período en la tabla acumulativa. Idempotente: volver a
 * consolidar el mismo mes lo recalcula y lo pisa.
 */
export async function consolidarGuiaMes(periodo: string): Promise<{ guias: number }> {
  validarPeriodo(periodo);
  const filas = await calcularGuiaMes(periodo);
  for (const f of filas) {
    await execute(
      `INSERT INTO reporting_guia_mes
         (guia_user_id, periodo, sesiones_dictadas, sesiones_cerradas, clubes,
          ninos_atendidos, presentes, ausentes, justificados, casos_atencion, consolidado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (guia_user_id, periodo) DO UPDATE
          SET sesiones_dictadas = EXCLUDED.sesiones_dictadas,
              sesiones_cerradas = EXCLUDED.sesiones_cerradas,
              clubes = EXCLUDED.clubes,
              ninos_atendidos = EXCLUDED.ninos_atendidos,
              presentes = EXCLUDED.presentes,
              ausentes = EXCLUDED.ausentes,
              justificados = EXCLUDED.justificados,
              casos_atencion = EXCLUDED.casos_atencion,
              consolidado_en = now()`,
      [
        f.guiaUserId,
        periodo,
        f.sesionesDictadas,
        f.sesionesCerradas,
        f.clubes,
        f.ninosAtendidos,
        f.presentes,
        f.ausentes,
        f.justificados,
        f.casosAtencion,
      ],
    );
  }
  return { guias: filas.length };
}

/**
 * Lee lo consolidado. Sin `periodo` devuelve TODO el histórico acumulado —
 * que es lo que se extrae para el informe.
 */
export async function leerGuiaMes(
  periodo?: string,
): Promise<(GuiaMes & { consolidadoEn: string })[]> {
  const values: unknown[] = [];
  let where = "";
  if (periodo !== undefined) {
    validarPeriodo(periodo);
    values.push(periodo);
    where = `WHERE r.periodo = $1`;
  }
  return queryRows<GuiaMes & { consolidadoEn: string }>(
    `SELECT r.guia_user_id AS "guiaUserId", u.username AS guia, r.periodo,
            r.sesiones_dictadas AS "sesionesDictadas", r.sesiones_cerradas AS "sesionesCerradas",
            r.clubes, r.ninos_atendidos AS "ninosAtendidos", r.presentes, r.ausentes,
            r.justificados, r.casos_atencion AS "casosAtencion",
            r.consolidado_en::text AS "consolidadoEn"
       FROM reporting_guia_mes r
       LEFT JOIN identity_user u ON u.id = r.guia_user_id
      ${where}
      ORDER BY r.periodo DESC, u.username`,
    values,
  );
}
