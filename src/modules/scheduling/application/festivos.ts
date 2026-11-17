import { queryRows } from "@/platform/db/query";

/**
 * GESTIÓN FESTIVOS (Académica › Sesiones, 2026-11-16).
 *
 * Qué pasa con un feriado (política de feriados, 2026-07-22): el calendario de
 * feriados es del SALÓN. Si el día es feriado en el país del salón, esa sesión no
 * se dicta y se corre al final del curso; nadie pierde clases. Pero el salón puede
 * tener niños de OTRO país, que ese día no es feriado para ellos: se quedan sin
 * clase aunque podrían tomarla. Esta pantalla los encuentra ANTES y le deja a
 * coordinación pasarlos, solo ese día, a la clase de otro salón.
 *
 * Todo se DERIVA (nada se guarda salvo el agendado que aprueba coordinación):
 *  - feriados: `scheduling_holiday`, los mismos que usa la generación;
 *  - salón afectado: activo, con ese país en su calendario, con una clase en ese día de la
 *    semana que NO existe ese día (la generación ya la corrió al final) y con el curso
 *    en marcha;
 *  - niño afectado: matrícula ACTIVA en ese salón y de OTRO país que el festivo;
 *  - resuelto: ya tiene una clase agendada ese día (`scheduling_agendado`).
 */

export interface SalonAfectado {
  id: string;
  nombre: string;
  curso: string;
  campaignId: string;
  campania: string;
  /** La hora de pared de la clase que no se dicta, y su instante. */
  hora: string;
  startsAt: string;
  duracionMin: number;
  ninosOtroPais: number;
  ninosMismoPais: number;
}

export interface AlumnoAfectado {
  childPersonId: string;
  nombre: string;
  documento: string;
  /** País del niño (distinto del festivo). */
  pais: string;
  classroomId: string;
  salon: string;
  curso: string;
  campania: string;
  /** La clase que no tendrá: su instante. */
  startsAt: string;
  duracionMin: number;
  /** Lo que coordinación ya le agendó ese día, si lo hizo. */
  agendado: {
    id: string;
    salon: string;
    campania: string;
    curso: string;
    startsAt: string;
    motivo: string | null;
  } | null;
}

export interface FestivoImpacto {
  pais: string;
  fecha: string;
  nombre: string;
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
  salones: SalonAfectado[];
  /** Cursos distintos que toca (JUNIOR, YOUNGSTER). */
  cursos: string[];
  /** Niños de OTRO país en esos salones: los que quedan sin clase. */
  alumnos: AlumnoAfectado[];
  /** Niños del país del festivo en esos salones: están de feriado, no necesitan nada. */
  propios: number;
}

/** Cuántos días hacia adelante se mira por defecto, y el tope. */
export const DIAS_FESTIVOS_DEFECTO = 60;
export const DIAS_FESTIVOS_MAXIMO = 180;

interface FilaImpacto {
  pais: string;
  fecha: string;
  nombre: string;
  classroomId: string | null;
  salon: string | null;
  curso: string | null;
  campaignId: string | null;
  campania: string | null;
  hora: string | null;
  startsAt: string | null;
  duracionMin: number | null;
  childPersonId: string | null;
  nombres: string | null;
  apellidos: string | null;
  documento: string | null;
  paisNino: string | null;
  deFeriado: boolean | null;
  agId: string | null;
  agSalon: string | null;
  agCampania: string | null;
  agCurso: string | null;
  agStartsAt: string | null;
  agMotivo: string | null;
}

/**
 * Los feriados de los próximos `dias` y, de cada uno, los salones y niños que
 * deja sin clase. `countryScope` acota a los niños de esos países (alcance del rol).
 */
export async function festivosProximos(input: {
  dias?: number;
  countryScope: string[] | null;
}): Promise<FestivoImpacto[]> {
  const dias = Math.min(Math.max(input.dias ?? DIAS_FESTIVOS_DEFECTO, 1), DIAS_FESTIVOS_MAXIMO);
  const filas = await queryRows<FilaImpacto>(
    `WITH rango AS (
       SELECT (now() AT TIME ZONE 'America/Bogota')::date AS desde,
              (now() AT TIME ZONE 'America/Bogota')::date + $1::int AS hasta
     )
     SELECT h.country_code::text AS pais, h.fecha::text AS fecha, h.nombre,
            x.classroom_id AS "classroomId", x.salon, x.curso, x.campaign_id AS "campaignId",
            x.campania, x.hora, x.starts_at AS "startsAt", x.duracion_min AS "duracionMin",
            x.child_person_id AS "childPersonId", x.nombres, x.apellidos, x.documento,
            x.pais_nino AS "paisNino", x.de_feriado AS "deFeriado",
            x.ag_id AS "agId", x.ag_salon AS "agSalon", x.ag_campania AS "agCampania",
            x.ag_curso AS "agCurso", x.ag_starts_at AS "agStartsAt", x.ag_motivo AS "agMotivo"
       FROM scheduling_holiday h
       CROSS JOIN rango r
       LEFT JOIN LATERAL (
         SELECT cl.id AS classroom_id, cl.nombre AS salon, cu.tipo::text AS curso,
                ca.id AS campaign_id, ca.nombre AS campania, ca.inicio AS campania_inicio,
                sl.hora_local AS hora, sl.duracion_min,
                ((h.fecha::timestamp + sl.hora_local::time) AT TIME ZONE cl.timezone) AS starts_at,
                p.id AS child_person_id, p.nombres, p.apellidos, p.doc_numero AS documento,
                p.country_code::text AS pais_nino,
                -- Está de feriado: es del país del festivo, o SU país también lo tiene ese día.
                (p.country_code = h.country_code OR EXISTS (
                   SELECT 1 FROM scheduling_holiday ph
                    WHERE ph.country_code = p.country_code AND ph.fecha = h.fecha)) AS de_feriado,
                ag.id AS ag_id, ag.salon AS ag_salon, ag.campania AS ag_campania,
                ag.curso AS ag_curso, ag.starts_at AS ag_starts_at, ag.motivo AS ag_motivo
           FROM scheduling_classroom cl
           JOIN catalog_course cu ON cu.id = cl.course_id
           JOIN catalog_campaign ca ON ca.id = cu.campaign_id
           JOIN scheduling_slot sl ON sl.classroom_id = cl.id AND sl.tipo = 'SESION'
                AND sl.dia_semana = EXTRACT(DOW FROM h.fecha)::int
           LEFT JOIN enrollment_enrollment e ON e.classroom_id = cl.id AND e.estado = 'ACTIVA'
           LEFT JOIN people_person p ON p.id = e.child_person_id
           LEFT JOIN LATERAL (
             SELECT a.id, acl.nombre AS salon, aca.nombre AS campania, acu.tipo::text AS curso,
                    a.starts_at, a.motivo
               FROM scheduling_agendado a
               JOIN scheduling_classroom acl ON acl.id = a.classroom_id
               JOIN catalog_course acu ON acu.id = acl.course_id
               JOIN catalog_campaign aca ON aca.id = acu.campaign_id
              WHERE a.child_person_id = p.id AND a.estado = 'ACTIVA' AND a.tipo = 'REGULAR'
                AND (a.starts_at AT TIME ZONE cl.timezone)::date = h.fecha
              LIMIT 1
           ) ag ON true
          WHERE cl.activo AND cl.holiday_country = h.country_code
            -- El curso ya empezó y todavía tiene clases por delante.
            AND h.fecha >= cu.inicio
            -- Y la clase que se pierde todavía no empezó (hoy, la de más tarde sí; la que ya pasó no).
            AND ((h.fecha::timestamp + sl.hora_local::time) AT TIME ZONE cl.timezone) > now()
            AND h.fecha <= (
              SELECT max((s.starts_at AT TIME ZONE cl.timezone)::date)
                FROM scheduling_session s
               WHERE s.classroom_id = cl.id AND s.slot_id IS NOT NULL)
            -- La clase de ese día NO existe: la generación la corrió al final.
            AND NOT EXISTS (
              SELECT 1 FROM scheduling_session s
               WHERE s.classroom_id = cl.id AND s.slot_id = sl.id
                 AND (s.starts_at AT TIME ZONE cl.timezone)::date = h.fecha)
       ) x ON true
      WHERE h.fecha BETWEEN r.desde AND r.hasta
      ORDER BY h.fecha, h.country_code, x.campania_inicio DESC NULLS LAST, x.curso, x.salon,
               x.apellidos, x.nombres`,
    [dias],
  );

  const porFestivo = new Map<string, FestivoImpacto>();
  for (const f of filas) {
    const clave = `${f.pais}|${f.fecha}`;
    let fest = porFestivo.get(clave);
    if (fest === undefined) {
      fest = {
        pais: f.pais,
        fecha: f.fecha,
        nombre: f.nombre,
        diaSemana: new Date(`${f.fecha}T12:00:00Z`).getUTCDay(),
        salones: [],
        cursos: [],
        alumnos: [],
        propios: 0,
      };
      porFestivo.set(clave, fest);
    }
    if (f.classroomId === null) continue;

    let salon = fest.salones.find((s) => s.id === f.classroomId);
    if (salon === undefined) {
      salon = {
        id: f.classroomId,
        nombre: f.salon ?? "",
        curso: f.curso ?? "",
        campaignId: f.campaignId ?? "",
        campania: f.campania ?? "",
        hora: f.hora ?? "",
        startsAt: new Date(f.startsAt ?? 0).toISOString(),
        duracionMin: f.duracionMin ?? 0,
        ninosOtroPais: 0,
        ninosMismoPais: 0,
      };
      fest.salones.push(salon);
      if (!fest.cursos.includes(salon.curso)) fest.cursos.push(salon.curso);
    }
    if (f.childPersonId === null || f.paisNino === null) continue;
    if (input.countryScope !== null && !input.countryScope.includes(f.paisNino)) continue;

    if (f.deFeriado === true) {
      salon.ninosMismoPais += 1;
      fest.propios += 1;
      continue;
    }
    salon.ninosOtroPais += 1;
    fest.alumnos.push({
      childPersonId: f.childPersonId,
      nombre: `${f.nombres ?? ""} ${f.apellidos ?? ""}`.trim(),
      documento: f.documento ?? "",
      pais: f.paisNino,
      classroomId: f.classroomId,
      salon: salon.nombre,
      curso: salon.curso,
      campania: salon.campania,
      startsAt: salon.startsAt,
      duracionMin: salon.duracionMin,
      agendado:
        f.agId === null
          ? null
          : {
              id: f.agId,
              salon: f.agSalon ?? "",
              campania: f.agCampania ?? "",
              curso: f.agCurso ?? "",
              startsAt: new Date(f.agStartsAt ?? 0).toISOString(),
              motivo: f.agMotivo,
            },
    });
  }
  return [...porFestivo.values()];
}

/** El feriado de ese país y día, o null si no existe en la tabla. */
export async function festivoDe(pais: string, fecha: string): Promise<{ nombre: string } | null> {
  const [f] = await queryRows<{ nombre: string }>(
    `SELECT nombre FROM scheduling_holiday WHERE country_code = $1 AND fecha = $2::date`,
    [pais, fecha],
  );
  return f ?? null;
}

/**
 * ¿Es este niño de los que ese feriado deja sin clase? Matrícula ACTIVA en un salón
 * activo con ese país en su calendario, y el niño es de OTRO país. La aprobación lo
 * vuelve a comprobar: lo que llega de la pantalla no se da por bueno.
 */
export async function ninoAfectadoPorFestivo(input: {
  childPersonId: string;
  pais: string;
  fecha: string;
}): Promise<boolean> {
  const [f] = await queryRows<{ ok: boolean }>(
    `SELECT true AS ok
       FROM enrollment_enrollment e
       JOIN scheduling_classroom cl ON cl.id = e.classroom_id AND cl.activo
       JOIN people_person p ON p.id = e.child_person_id
      WHERE e.child_person_id = $1 AND e.estado = 'ACTIVA'
        AND cl.holiday_country = $2 AND p.country_code <> $2
        -- Si su propio país también tiene feriado ese día, está de feriado: no hay nada que cambiar.
        AND NOT EXISTS (SELECT 1 FROM scheduling_holiday ph
                         WHERE ph.country_code = p.country_code AND ph.fecha = $3::date)
        AND EXISTS (SELECT 1 FROM scheduling_holiday h
                     WHERE h.country_code = $2 AND h.fecha = $3::date)
      LIMIT 1`,
    [input.childPersonId, input.pais, input.fecha],
  );
  return f?.ok === true;
}
