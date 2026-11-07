import { ESTADOS_QUE_CIERRAN } from "@/modules/casos";
import { resumenEvaluacionesLibro } from "@/modules/catalog";
import { queryOne, queryRows } from "@/platform/db/query";

/**
 * MIS ALUMNOS POR CURSO (2026-11-06), el "Mis alumnos" del panel de guías de
 * MOSAICO: los salones del guía y, por cada niño, asistencia, faltas
 * recientes, casos abiertos y lo que hizo en el LIBRO (evaluaciones y proyectos
 * por revisar), con sus alertas.
 *
 * Vive en `reporting` porque es un tablero: lee asistencia, casos y el registro
 * del libro por SQL sin acoplar esos módulos entre sí. La asistencia cuenta solo
 * las clases del salón (un Club es de inscritos, no de todo el salón).
 */

/** Por debajo de esto la asistencia es una alerta (con al menos 3 marcas). */
export const ASISTENCIA_MINIMA = 80;
/** Ausencias entre las últimas 4 clases marcadas que ya son alerta. */
export const FALTAS_RECIENTES_ALERTA = 2;

export interface AlumnoDeSalon {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  docNumero: string;
  username: string | null;
  presentes: number;
  marcadas: number;
  /** % sobre las clases marcadas (null = ninguna marcada todavía). */
  asistencia: number | null;
  ultimaAsistencia: string | null;
  faltasRecientes: number;
  casosAbiertos: number;
  /** Del libro (lo que reportó el navegador, en todos sus niveles). */
  evaluacionesAprobadas: number;
  proyectosAprobados: number;
  proyectosPorRevisar: number;
  libroActualizado: string | null;
  alertas: string[];
}

export interface SalonDelGuia {
  id: string;
  nombre: string;
  campania: string;
  curso: string;
  pais: string;
  horario: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
  sesionesTotal: number;
  sesionesDictadas: number;
  alumnos: AlumnoDeSalon[];
}

/** Las alertas de un alumno, en el orden en que conviene atenderlas. */
export function alertasDeAlumno(a: {
  asistencia: number | null;
  marcadas: number;
  faltasRecientes: number;
  casosAbiertos: number;
  proyectosPorRevisar: number;
}): string[] {
  const r: string[] = [];
  if (a.proyectosPorRevisar > 0) r.push("Proyecto por revisar");
  if (a.casosAbiertos > 0) r.push("Caso abierto");
  if (a.faltasRecientes >= FALTAS_RECIENTES_ALERTA) r.push("Faltas recientes");
  if (a.asistencia !== null && a.marcadas >= 3 && a.asistencia < ASISTENCIA_MINIMA) {
    r.push("Asistencia baja");
  }
  return r;
}

/** Nombre del guía (su ficha; si no, el usuario). */
export async function nombreDeGuia(guiaUserId: string): Promise<string | null> {
  const fila = await queryOne<{ nombre: string }>(
    `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', g.nombres, g.apellidos)), ''), u.username) AS nombre
       FROM identity_user u LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
      WHERE u.id = $1`,
    [guiaUserId],
  );
  return fila?.nombre ?? null;
}

/** Los salones ACTIVOS del guía con sus alumnos (matrícula ACTIVA). */
export async function misAlumnos(guiaUserId: string): Promise<SalonDelGuia[]> {
  const salones = await queryRows<Omit<SalonDelGuia, "alumnos">>(
    `SELECT cl.id, cl.nombre, ca.nombre AS campania, cu.tipo::text AS curso,
            cl.holiday_country AS pais,
            COALESCE((SELECT json_agg(json_build_object(
                        'tipo', sl.tipo::text, 'diaSemana', sl.dia_semana,
                        'horaLocal', sl.hora_local, 'duracionMin', sl.duracion_min))
                        FROM scheduling_slot sl WHERE sl.classroom_id = cl.id), '[]'::json) AS horario,
            (SELECT count(*) FROM scheduling_session s
              WHERE s.classroom_id = cl.id AND s.slot_id IS NOT NULL AND s.tipo = 'SESION')::int
              AS "sesionesTotal",
            (SELECT count(*) FROM scheduling_session s
              WHERE s.classroom_id = cl.id AND s.slot_id IS NOT NULL AND s.tipo = 'SESION'
                AND s.starts_at < now())::int AS "sesionesDictadas"
       FROM scheduling_classroom cl
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
      WHERE cl.activo AND cl.guia_user_id = $1
      ORDER BY ca.nombre, cl.nombre`,
    [guiaUserId],
  );
  if (salones.length === 0) return [];

  const alumnos = await queryRows<
    Omit<
      AlumnoDeSalon,
      | "asistencia"
      | "alertas"
      | "evaluacionesAprobadas"
      | "proyectosAprobados"
      | "proyectosPorRevisar"
      | "libroActualizado"
    > & { classroomId: string }
  >(
    `SELECT e.classroom_id AS "classroomId", p.id AS "childPersonId", p.nombres, p.apellidos,
            p.doc_numero AS "docNumero", u.username,
            COALESCE(a.presentes, 0) AS presentes, COALESCE(a.marcadas, 0) AS marcadas,
            a.ultima AS "ultimaAsistencia", COALESCE(r.faltas, 0) AS "faltasRecientes",
            (SELECT count(*) FROM casos_caso c
              WHERE c.child_person_id = p.id AND NOT (c.estado = ANY($2::text[])))::int
              AS "casosAbiertos"
       FROM enrollment_enrollment e
       JOIN people_person p ON p.id = e.child_person_id
       LEFT JOIN identity_user u ON u.id = p.user_id
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE m.estado = 'PRESENTE')::int AS presentes,
                count(*)::int AS marcadas,
                max(s.fecha) FILTER (WHERE m.estado = 'PRESENTE')::text AS ultima
           FROM attendance_attendance m JOIN scheduling_session s ON s.id = m.session_id
          WHERE m.child_person_id = p.id AND s.classroom_id = e.classroom_id AND s.tipo <> 'CLUB'
       ) a ON true
       LEFT JOIN LATERAL (
         SELECT count(*) FILTER (WHERE x.estado = 'AUSENTE')::int AS faltas FROM (
           SELECT m.estado FROM attendance_attendance m JOIN scheduling_session s ON s.id = m.session_id
            WHERE m.child_person_id = p.id AND s.classroom_id = e.classroom_id AND s.tipo <> 'CLUB'
            ORDER BY s.starts_at DESC LIMIT 4) x
       ) r ON true
      WHERE e.estado = 'ACTIVA' AND e.classroom_id = ANY($1::uuid[])
      ORDER BY p.apellidos, p.nombres`,
    [salones.map((s) => s.id), [...ESTADOS_QUE_CIERRAN]],
  );
  const ids = alumnos.map((a) => a.childPersonId);

  // Proyectos: la ÚLTIMA entrega de cada unidad y la última revisión de esa entrega.
  const proyectos = await queryRows<{
    childPersonId: string;
    porRevisar: number;
    aprobados: number;
  }>(
    `SELECT e.child_person_id AS "childPersonId",
            count(*) FILTER (WHERE r.decision IS NULL)::int AS "porRevisar",
            count(*) FILTER (WHERE r.decision = 'approved')::int AS aprobados
       FROM (SELECT DISTINCT ON (child_person_id, curso, nivel, unidad) *
               FROM catalog_proyecto_entrega WHERE child_person_id = ANY($1::uuid[])
              ORDER BY child_person_id, curso, nivel, unidad, intento DESC) e
       LEFT JOIN LATERAL (
         SELECT rv.decision FROM catalog_proyecto_revision rv WHERE rv.entrega_id = e.id
          ORDER BY rv.revisado_en DESC, rv.id DESC LIMIT 1
       ) r ON true
      GROUP BY e.child_person_id`,
    [ids],
  );
  const estado = await queryRows<{
    childPersonId: string;
    clave: string;
    valor: string;
    actualizadoEn: Date;
  }>(
    `SELECT child_person_id AS "childPersonId", clave,
            CASE WHEN clave LIKE '%-assessments-v2' THEN valor ELSE '' END AS valor,
            actualizado_en AS "actualizadoEn"
       FROM catalog_libro_estado WHERE child_person_id = ANY($1::uuid[])`,
    [ids],
  );
  const porProyectos = new Map(proyectos.map((p) => [p.childPersonId, p]));

  const conLibro = alumnos.map((a): AlumnoDeSalon & { classroomId: string } => {
    const propio = estado.filter((e) => e.childPersonId === a.childPersonId);
    const evaluacionesAprobadas = propio
      .filter((e) => e.clave.endsWith("-assessments-v2"))
      .reduce(
        (n, e) => n + resumenEvaluacionesLibro(e.valor).filter((u) => u.evaluacionAprobada).length,
        0,
      );
    const fechas = propio.map((e) => e.actualizadoEn.getTime());
    const p = porProyectos.get(a.childPersonId);
    const base = {
      ...a,
      asistencia: a.marcadas > 0 ? Math.round((a.presentes / a.marcadas) * 100) : null,
      evaluacionesAprobadas,
      proyectosAprobados: p?.aprobados ?? 0,
      proyectosPorRevisar: p?.porRevisar ?? 0,
      libroActualizado: fechas.length > 0 ? new Date(Math.max(...fechas)).toISOString() : null,
    };
    return { ...base, alertas: alertasDeAlumno(base) };
  });

  return salones.map((s) => ({
    ...s,
    alumnos: conLibro.filter((a) => a.classroomId === s.id),
  }));
}
