import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";

type Queryable = Pick<PoolClient, "query">;

// ============================================================
// Catálogo de horarios (mantenimiento centralizado por tipo de curso)
// ============================================================

export interface HorarioSlotInput {
  tipo: "SESION" | "CLUB";
  diaSemana: number;
  horaLocal: string;
  duracionMin?: number | undefined;
}

export interface HorarioCatalogoRecord {
  id: string;
  tipoCurso: string;
  etiqueta: string;
  activo: boolean;
  orden: number;
  slots: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
}

/** Inserta un horario del catálogo con sus slots (dentro de una transacción). */
export async function insertHorarioCatalogo(
  tx: Queryable,
  input: { tipoCurso: string; etiqueta: string; orden: number; slots: HorarioSlotInput[] },
): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO scheduling_horario (id, tipo_curso, etiqueta, orden, updated_at)
     VALUES ($1, $2::catalog_course_tipo, $3, $4, now())`,
    [id, input.tipoCurso, input.etiqueta.trim(), input.orden],
    tx,
  );
  for (const slot of input.slots) {
    await execute(
      `INSERT INTO scheduling_horario_slot
         (id, horario_id, tipo, dia_semana, hora_local, duracion_min)
       VALUES ($1, $2, $3::scheduling_slot_tipo, $4, $5, $6)`,
      [newId(), id, slot.tipo, slot.diaSemana, slot.horaLocal, slot.duracionMin ?? 60],
      tx,
    );
  }
  return id;
}

const SELECT_HORARIO = `SELECT h.id, h.tipo_curso::text AS "tipoCurso", h.etiqueta,
    h.activo, h.orden,
    COALESCE(
      (SELECT json_agg(json_build_object(
                'tipo', s.tipo, 'diaSemana', s.dia_semana,
                'horaLocal', s.hora_local, 'duracionMin', s.duracion_min)
                ORDER BY s.dia_semana, s.hora_local)
         FROM scheduling_horario_slot s WHERE s.horario_id = h.id),
      '[]'::json) AS slots
  FROM scheduling_horario h`;

export async function listHorariosCatalogo(filtros?: {
  tipoCurso?: string | undefined;
  soloActivos?: boolean | undefined;
}): Promise<HorarioCatalogoRecord[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (filtros?.tipoCurso !== undefined && filtros.tipoCurso !== "") {
    values.push(filtros.tipoCurso);
    where.push(`h.tipo_curso = $${values.length}::catalog_course_tipo`);
  }
  if (filtros?.soloActivos === true) {
    where.push(`h.activo = true`);
  }
  return queryRows<HorarioCatalogoRecord>(
    `${SELECT_HORARIO}
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY h.tipo_curso, h.orden, h.etiqueta`,
    values,
  );
}

export async function getHorarioCatalogo(id: string): Promise<HorarioCatalogoRecord | null> {
  return queryOne<HorarioCatalogoRecord>(`${SELECT_HORARIO} WHERE h.id = $1`, [id]);
}

export async function existsHorarioEtiqueta(
  tipoCurso: string,
  etiqueta: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM scheduling_horario
      WHERE tipo_curso = $1::catalog_course_tipo AND lower(etiqueta) = lower($2)`,
    [tipoCurso, etiqueta.trim()],
  );
  return row !== null;
}

export async function setHorarioActivo(id: string, activo: boolean): Promise<void> {
  await execute(
    `UPDATE scheduling_horario SET activo = $2, updated_at = now() WHERE id = $1`,
    [id, activo],
  );
}

export interface ClassroomRecord {
  id: string;
  courseId: string;
  nombre: string;
  guiaUserId: string | null;
  cupo: number;
  meetingUrl: string | null;
  timezone: string;
  holidayCountry: string;
  activo: boolean;
}

export interface SlotRecord {
  id: string;
  tipo: "SESION" | "CLUB";
  diaSemana: number;
  horaLocal: string;
  duracionMin: number;
}

const SELECT_CLASSROOM = `SELECT id, course_id AS "courseId", nombre,
  guia_user_id AS "guiaUserId", cupo, meeting_url AS "meetingUrl", timezone,
  holiday_country AS "holidayCountry", activo
  FROM scheduling_classroom`;

export async function findClassroomById(
  id: string,
  client?: Queryable,
): Promise<ClassroomRecord | null> {
  return queryOne<ClassroomRecord>(`${SELECT_CLASSROOM} WHERE id = $1`, [id], client);
}

export async function getSlots(classroomId: string, client?: Queryable): Promise<SlotRecord[]> {
  return queryRows<SlotRecord>(
    `SELECT id, tipo, dia_semana AS "diaSemana", hora_local AS "horaLocal",
            duracion_min AS "duracionMin"
       FROM scheduling_slot WHERE classroom_id = $1
      ORDER BY dia_semana, hora_local`,
    [classroomId],
    client,
  );
}

/** Ventana NOMINAL del curso (catalog). Solo lectura, con ::text. */
export async function getCourseWindow(
  courseId: string,
  client?: Queryable,
): Promise<{ inicio: string; finalCurso: string; tipo: string } | null> {
  return queryOne<{ inicio: string; finalCurso: string; tipo: string }>(
    `SELECT inicio::text AS inicio, final_curso::text AS "finalCurso", tipo::text AS tipo
       FROM catalog_course WHERE id = $1`,
    [courseId],
    client,
  );
}

export async function insertClassroom(
  tx: Queryable,
  input: {
    courseId: string;
    nombre: string;
    guiaUserId: string | null;
    cupo: number;
    meetingUrl: string | null;
    timezone: string;
    holidayCountry: string;
  },
): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO scheduling_classroom
       (id, course_id, nombre, guia_user_id, cupo, meeting_url, timezone,
        holiday_country, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [
      id,
      input.courseId,
      input.nombre.trim(),
      input.guiaUserId,
      input.cupo,
      input.meetingUrl,
      input.timezone,
      input.holidayCountry,
    ],
    tx,
  );
  return id;
}

export async function insertSlot(
  tx: Queryable,
  classroomId: string,
  slot: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number },
): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO scheduling_slot (id, classroom_id, tipo, dia_semana, hora_local, duracion_min)
     VALUES ($1, $2, $3::scheduling_slot_tipo, $4, $5, $6)`,
    [id, classroomId, slot.tipo, slot.diaSemana, slot.horaLocal, slot.duracionMin],
    tx,
  );
  return id;
}

/** La regeneración es DESTRUCTIVA: borra todas las sesiones del salón. */
export async function deleteSessions(tx: Queryable, classroomId: string): Promise<number> {
  return execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId], tx);
}

export interface SessionRow {
  slotId: string;
  tipo: string;
  fecha: string;
  startsAt: Date;
  duracionMin: number;
  numero: number;
}

/** Inserción POR LOTES con unnest (trampa 2.8.3: nada de un INSERT por fila). */
export async function insertSessionsBatch(
  tx: Queryable,
  classroomId: string,
  rows: SessionRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await execute(
    `INSERT INTO scheduling_session
       (id, classroom_id, slot_id, tipo, fecha, starts_at, duracion_min, numero)
     SELECT unnest($1::uuid[]), $2, unnest($3::uuid[]),
            unnest($4::text[])::scheduling_slot_tipo, unnest($5::date[]),
            unnest($6::timestamptz[]), unnest($7::int[]), unnest($8::int[])`,
    [
      rows.map(() => newId()),
      classroomId,
      rows.map((r) => r.slotId),
      rows.map((r) => r.tipo),
      rows.map((r) => r.fecha),
      rows.map((r) => r.startsAt),
      rows.map((r) => r.duracionMin),
      rows.map((r) => r.numero),
    ],
    tx,
  );
}

export async function getHolidayDates(
  countryCode: string,
  desde: string,
  hasta: string,
  client?: Queryable,
): Promise<string[]> {
  const rows = await queryRows<{ fecha: string }>(
    `SELECT fecha::text AS fecha FROM scheduling_holiday
      WHERE country_code = $1 AND fecha BETWEEN $2::date AND $3::date`,
    [countryCode, desde, hasta],
    client,
  );
  return rows.map((r) => r.fecha);
}

export async function upsertHolidays(
  countryCode: string,
  feriados: { fecha: string; nombre: string; fuente: string }[],
  client?: Queryable,
): Promise<void> {
  for (const feriado of feriados) {
    await execute(
      `INSERT INTO scheduling_holiday (country_code, fecha, nombre, fuente)
       VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (country_code, fecha) DO UPDATE SET nombre = $3, fuente = $4`,
      [countryCode, feriado.fecha, feriado.nombre, feriado.fuente],
      client,
    );
  }
}

export async function getSuspensionDates(
  classroomId: string,
  client?: Queryable,
): Promise<string[]> {
  const rows = await queryRows<{ fecha: string }>(
    `SELECT fecha::text AS fecha FROM scheduling_suspension WHERE classroom_id = $1`,
    [classroomId],
    client,
  );
  return rows.map((r) => r.fecha);
}

export async function insertSuspension(
  tx: Queryable,
  classroomId: string,
  fecha: string,
  motivo: string,
): Promise<void> {
  await execute(
    `INSERT INTO scheduling_suspension (id, classroom_id, fecha, motivo)
     VALUES ($1, $2, $3::date, $4)
     ON CONFLICT (classroom_id, fecha) DO NOTHING`,
    [newId(), classroomId, fecha, motivo],
    tx,
  );
}

export interface SlotResumen {
  tipo: string;
  diaSemana: number;
  horaLocal: string;
  duracionMin: number;
}

export interface ClassroomListItem extends ClassroomRecord {
  curso: string;
  campania: string;
  guia: string | null;
  horario: SlotResumen[];
  ocupados: number;
  sesiones: number;
  primeraSesion: string | null;
  ultimaSesion: string | null;
}

export async function listClassrooms(courseId?: string): Promise<ClassroomListItem[]> {
  const values: unknown[] = [];
  let where = "";
  if (courseId !== undefined) {
    values.push(courseId);
    where = `WHERE cl.course_id = $1`;
  }
  const rows = await queryRows<Omit<ClassroomListItem, "horario"> & { horario: SlotResumen[] | null }>(
    `SELECT cl.id, cl.course_id AS "courseId", cl.nombre,
            cl.guia_user_id AS "guiaUserId", cl.cupo, cl.meeting_url AS "meetingUrl",
            cl.timezone, cl.holiday_country AS "holidayCountry", cl.activo,
            cu.tipo::text AS curso, ca.nombre AS campania,
            COALESCE(NULLIF(TRIM(gp.nombres || ' ' || gp.apellidos), ''), gu.username) AS guia,
            (SELECT json_agg(json_build_object(
                       'tipo', sl.tipo, 'diaSemana', sl.dia_semana,
                       'horaLocal', sl.hora_local, 'duracionMin', sl.duracion_min)
                       ORDER BY sl.dia_semana, sl.hora_local)
               FROM scheduling_slot sl WHERE sl.classroom_id = cl.id) AS horario,
            (SELECT count(*) FROM enrollment_enrollment e
              WHERE e.classroom_id = cl.id AND e.estado IN ('ACTIVA', 'RESERVADA'))::int AS ocupados,
            count(s.id)::int AS sesiones,
            min(s.fecha)::text AS "primeraSesion",
            max(s.fecha)::text AS "ultimaSesion"
       FROM scheduling_classroom cl
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN identity_user gu ON gu.id = cl.guia_user_id
       LEFT JOIN people_person gp ON gp.user_id = gu.id
       LEFT JOIN scheduling_session s ON s.classroom_id = cl.id
      ${where}
      GROUP BY cl.id, cu.tipo, ca.nombre, gu.username, gp.nombres, gp.apellidos
      ORDER BY ca.nombre, cu.tipo, cl.nombre`,
    values,
  );
  return rows.map((r) => ({ ...r, horario: r.horario ?? [] }));
}

export interface AgendaItem {
  id: string;
  fecha: string;
  horaLocal: string;
  tipo: string;
  numero: number;
  classroomId: string;
  salon: string;
  cursoTipo: string;
  campania: string;
  cupo: number;
  ocupados: number;
  guia: string | null;
}

/**
 * Agenda del mes: TODAS las sesiones entre [desde, hasta] de todos los salones.
 * La hora local se resuelve EN SQL con AT TIME ZONE del salón (ADR-0007).
 */
export async function agendaSesiones(
  desde: string,
  hasta: string,
  filtros?: { campaignId?: string | undefined },
): Promise<AgendaItem[]> {
  const values: unknown[] = [desde, hasta];
  let extra = "";
  if (filtros?.campaignId !== undefined && filtros.campaignId !== "") {
    values.push(filtros.campaignId);
    extra = `AND cu.campaign_id = $${values.length}`;
  }
  return queryRows<AgendaItem>(
    `SELECT s.id, s.fecha::text AS fecha,
            to_char(s.starts_at AT TIME ZONE cl.timezone, 'HH24:MI') AS "horaLocal",
            s.tipo::text AS tipo, s.numero,
            cl.id AS "classroomId", cl.nombre AS salon, cl.cupo,
            cu.tipo::text AS "cursoTipo", ca.nombre AS campania,
            COALESCE(NULLIF(TRIM(gp.nombres || ' ' || gp.apellidos), ''), gu.username) AS guia,
            (SELECT count(*) FROM enrollment_enrollment e
              WHERE e.classroom_id = cl.id AND e.estado IN ('ACTIVA', 'RESERVADA'))::int AS ocupados
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN identity_user gu ON gu.id = cl.guia_user_id
       LEFT JOIN people_person gp ON gp.user_id = gu.id
      WHERE s.fecha BETWEEN $1::date AND $2::date ${extra}
      ORDER BY s.starts_at, cl.nombre`,
    values,
  );
}

export interface SesionDetalle {
  sesion: {
    id: string;
    tipo: string;
    fecha: string;
    horaLocal: string;
    numero: number;
    duracionMin: number;
  };
  salon: {
    id: string;
    nombre: string;
    cupo: number;
    timezone: string;
    holidayCountry: string;
    meetingUrl: string | null;
  };
  curso: { id: string; tipo: string; campania: string };
  guia: { userId: string; nombre: string; pais: string } | null;
}

/** Detalle de una sesión con su salón, curso y guía (para el resumen del evento). */
export async function detalleSesion(sessionId: string): Promise<SesionDetalle | null> {
  interface Row {
    sesionId: string;
    sesionTipo: string;
    fecha: string;
    horaLocal: string;
    numero: number;
    duracionMin: number;
    classroomId: string;
    salon: string;
    cupo: number;
    timezone: string;
    holidayCountry: string;
    meetingUrl: string | null;
    courseId: string;
    cursoTipo: string;
    campania: string;
    guiaUserId: string | null;
    guiaNombre: string | null;
  }
  const row = await queryOne<Row>(
    `SELECT s.id AS "sesionId", s.tipo::text AS "sesionTipo", s.fecha::text AS fecha,
            to_char(s.starts_at AT TIME ZONE cl.timezone, 'HH24:MI') AS "horaLocal",
            s.numero, s.duracion_min AS "duracionMin",
            cl.id AS "classroomId", cl.nombre AS salon, cl.cupo, cl.timezone,
            cl.holiday_country AS "holidayCountry", cl.meeting_url AS "meetingUrl",
            cu.id AS "courseId", cu.tipo::text AS "cursoTipo", ca.nombre AS campania,
            gu.id AS "guiaUserId",
            COALESCE(NULLIF(TRIM(gp.nombres || ' ' || gp.apellidos), ''), gu.username) AS "guiaNombre"
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN identity_user gu ON gu.id = cl.guia_user_id
       LEFT JOIN people_person gp ON gp.user_id = gu.id
      WHERE s.id = $1`,
    [sessionId],
  );
  if (row === null) return null;
  return {
    sesion: {
      id: row.sesionId,
      tipo: row.sesionTipo,
      fecha: row.fecha,
      horaLocal: row.horaLocal,
      numero: row.numero,
      duracionMin: row.duracionMin,
    },
    salon: {
      id: row.classroomId,
      nombre: row.salon,
      cupo: row.cupo,
      timezone: row.timezone,
      holidayCountry: row.holidayCountry,
      meetingUrl: row.meetingUrl,
    },
    curso: { id: row.courseId, tipo: row.cursoTipo, campania: row.campania },
    guia:
      row.guiaUserId !== null
        ? {
            userId: row.guiaUserId,
            nombre: row.guiaNombre ?? "(sin nombre)",
            pais: row.holidayCountry,
          }
        : null,
  };
}

/** Actualiza el guía del salón (null = quitar). No regenera sesiones. */
export async function updateGuiaSalon(
  classroomId: string,
  guiaUserId: string | null,
  client?: Queryable,
): Promise<void> {
  await execute(
    `UPDATE scheduling_classroom SET guia_user_id = $2, updated_at = now() WHERE id = $1`,
    [classroomId, guiaUserId],
    client,
  );
}

export interface SessionListItem {
  id: string;
  tipo: string;
  fecha: string;
  startsAt: Date;
  duracionMin: number;
  numero: number;
}

export async function getSessions(classroomId: string): Promise<SessionListItem[]> {
  return queryRows<SessionListItem>(
    `SELECT id, tipo::text AS tipo, fecha::text AS fecha, starts_at AS "startsAt",
            duracion_min AS "duracionMin", numero
       FROM scheduling_session WHERE classroom_id = $1
      ORDER BY starts_at`,
    [classroomId],
  );
}

export async function sessionExisteEnFecha(
  classroomId: string,
  fecha: string,
  client?: Queryable,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM scheduling_session WHERE classroom_id = $1 AND fecha = $2::date LIMIT 1`,
    [classroomId, fecha],
    client,
  );
  return row !== null;
}
