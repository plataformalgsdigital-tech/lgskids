import { queryOne, queryRows } from "@/platform/db/query";

/**
 * Consultas del TABLERO (pantalla de entrada del panel).
 *
 * Viven en `reporting` porque es el módulo de informes y tableros: lee varias
 * tablas por SQL sin acoplar módulos entre sí, igual que los reportes ya
 * existentes.
 *
 * La agrupación temporal va SIEMPRE en SQL con `AT TIME ZONE` anclado a la
 * zona operativa DEL SALÓN (ADR-0007). "Hoy" no es el día del servidor: es el
 * día en el salón donde se dicta la clase.
 */

export interface ResumenTablero {
  salonesActivos: number;
  salonesSinGuia: number;
  cuposTotales: number;
  cuposOcupados: number;
  reservasPendientes: number;
}

/** Cifras globales de operación, acotadas por los salones activos. */
export async function resumenTablero(): Promise<ResumenTablero> {
  const fila = await queryOne<{
    salonesActivos: number;
    salonesSinGuia: number;
    cuposTotales: number;
    cuposOcupados: number;
    reservasPendientes: number;
  }>(
    `SELECT
       count(*) FILTER (WHERE cl.activo)::int                              AS "salonesActivos",
       count(*) FILTER (WHERE cl.activo AND cl.guia_user_id IS NULL)::int  AS "salonesSinGuia",
       COALESCE(sum(cl.cupo) FILTER (WHERE cl.activo), 0)::int             AS "cuposTotales",
       COALESCE(sum(oc.activas) FILTER (WHERE cl.activo), 0)::int          AS "cuposOcupados",
       COALESCE(sum(oc.reservadas) FILTER (WHERE cl.activo), 0)::int       AS "reservasPendientes"
     FROM scheduling_classroom cl
     LEFT JOIN LATERAL (
       SELECT count(*) FILTER (WHERE e.estado = 'ACTIVA')::int    AS activas,
              count(*) FILTER (WHERE e.estado = 'RESERVADA')::int AS reservadas
         FROM enrollment_enrollment e
        WHERE e.classroom_id = cl.id
     ) oc ON true`,
    [],
  );
  return (
    fila ?? {
      salonesActivos: 0,
      salonesSinGuia: 0,
      cuposTotales: 0,
      cuposOcupados: 0,
      reservasPendientes: 0,
    }
  );
}

export interface SalonSinGuia {
  id: string;
  nombre: string;
  campania: string;
}

/** Salones activos que todavía no tienen guía asignada. */
export async function salonesSinGuia(limite = 10): Promise<SalonSinGuia[]> {
  return queryRows<SalonSinGuia>(
    `SELECT cl.id, cl.nombre, ca.nombre AS campania
       FROM scheduling_classroom cl
       JOIN catalog_course co ON co.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = co.campaign_id
      WHERE cl.activo AND cl.guia_user_id IS NULL
      ORDER BY ca.nombre, cl.nombre
      LIMIT $1`,
    [limite],
  );
}

export interface ClaseDeHoy {
  sessionId: string;
  salon: string;
  tipo: string;
  startsAt: string;
  inscritos: number;
  marcadas: number;
}

/**
 * Sesiones de HOY de los salones de un guía, con cuántas asistencias lleva
 * marcadas. "Hoy" se resuelve en la zona de cada salón, no en la del servidor.
 *
 * Con `guiaUserId` en null devuelve las de TODOS los salones (vista de
 * administración).
 */
export async function clasesDeHoy(guiaUserId: string | null, limite = 12): Promise<ClaseDeHoy[]> {
  const values: unknown[] = [];
  let filtroGuia = "";
  if (guiaUserId !== null) {
    values.push(guiaUserId);
    filtroGuia = `AND cl.guia_user_id = $${String(values.length)}`;
  }
  values.push(limite);
  return queryRows<ClaseDeHoy>(
    `SELECT s.id AS "sessionId", cl.nombre AS salon, s.tipo::text AS tipo,
            s.starts_at AS "startsAt",
            (SELECT count(*) FROM enrollment_enrollment e
              WHERE e.classroom_id = cl.id AND e.estado = 'ACTIVA')::int AS inscritos,
            (SELECT count(*) FROM attendance_attendance a
              WHERE a.session_id = s.id)::int AS marcadas
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE cl.activo
        AND (s.starts_at AT TIME ZONE cl.timezone)::date
            = (now() AT TIME ZONE cl.timezone)::date
        ${filtroGuia}
      ORDER BY s.starts_at
      LIMIT $${String(values.length)}`,
    values,
  );
}

export interface SesionSinMarcar {
  sessionId: string;
  salon: string;
  fecha: string;
  inscritos: number;
}

/**
 * Sesiones YA dictadas sin ninguna marca de asistencia, dentro de los últimos
 * `dias`. Es la deuda operativa que el guía ve al entrar.
 */
export async function sesionesSinMarcar(
  guiaUserId: string | null,
  dias = 14,
  limite = 10,
): Promise<SesionSinMarcar[]> {
  const values: unknown[] = [dias];
  let filtroGuia = "";
  if (guiaUserId !== null) {
    values.push(guiaUserId);
    filtroGuia = `AND cl.guia_user_id = $${String(values.length)}`;
  }
  values.push(limite);
  return queryRows<SesionSinMarcar>(
    `SELECT s.id AS "sessionId", cl.nombre AS salon, s.fecha::text AS fecha,
            (SELECT count(*) FROM enrollment_enrollment e
              WHERE e.classroom_id = cl.id AND e.estado = 'ACTIVA')::int AS inscritos
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE cl.activo
        AND s.starts_at < now()
        AND s.starts_at >= now() - ($1::int * INTERVAL '1 day')
        AND NOT EXISTS (SELECT 1 FROM attendance_attendance a WHERE a.session_id = s.id)
        ${filtroGuia}
      ORDER BY s.starts_at DESC
      LIMIT $${String(values.length)}`,
    values,
  );
}

export interface ResumenGuia {
  salones: number;
  ninos: number;
  clasesHoy: number;
  sesionesSinMarcar: number;
}

/** Cifras propias del guía: solo sus salones. */
export async function resumenGuia(guiaUserId: string): Promise<ResumenGuia> {
  const fila = await queryOne<ResumenGuia>(
    `SELECT
       count(DISTINCT cl.id)::int AS salones,
       COALESCE(count(DISTINCT e.child_person_id) FILTER (WHERE e.estado = 'ACTIVA'), 0)::int AS ninos,
       COALESCE((
         SELECT count(*) FROM scheduling_session s2
           JOIN scheduling_classroom c2 ON c2.id = s2.classroom_id
          WHERE c2.guia_user_id = $1 AND c2.activo
            AND (s2.starts_at AT TIME ZONE c2.timezone)::date
                = (now() AT TIME ZONE c2.timezone)::date
       ), 0)::int AS "clasesHoy",
       COALESCE((
         SELECT count(*) FROM scheduling_session s3
           JOIN scheduling_classroom c3 ON c3.id = s3.classroom_id
          WHERE c3.guia_user_id = $1 AND c3.activo
            AND s3.starts_at < now()
            AND s3.starts_at >= now() - INTERVAL '14 days'
            AND NOT EXISTS (SELECT 1 FROM attendance_attendance a WHERE a.session_id = s3.id)
       ), 0)::int AS "sesionesSinMarcar"
     FROM scheduling_classroom cl
     LEFT JOIN enrollment_enrollment e ON e.classroom_id = cl.id
    WHERE cl.guia_user_id = $1 AND cl.activo`,
    [guiaUserId],
  );
  return fila ?? { salones: 0, ninos: 0, clasesHoy: 0, sesionesSinMarcar: 0 };
}
