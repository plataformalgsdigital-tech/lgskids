import type { PoolClient } from "pg";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";

type Queryable = Pick<PoolClient, "query">;

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

export interface ClassroomListItem extends ClassroomRecord {
  curso: string;
  campania: string;
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
  return queryRows<ClassroomListItem>(
    `SELECT cl.id, cl.course_id AS "courseId", cl.nombre,
            cl.guia_user_id AS "guiaUserId", cl.cupo, cl.meeting_url AS "meetingUrl",
            cl.timezone, cl.holiday_country AS "holidayCountry", cl.activo,
            cu.tipo::text AS curso, ca.nombre AS campania,
            count(s.id)::int AS sesiones,
            min(s.fecha)::text AS "primeraSesion",
            max(s.fecha)::text AS "ultimaSesion"
       FROM scheduling_classroom cl
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN scheduling_session s ON s.classroom_id = cl.id
      ${where}
      GROUP BY cl.id, cu.tipo, ca.nombre
      ORDER BY ca.nombre, cu.tipo, cl.nombre`,
    values,
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
