import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { isValidTimeZone, wallTimeToUtc } from "@/platform/time";
import { feriadosDelPais } from "../domain/feriados";
import { generarFechasSlot } from "../domain/generacion";
import {
  deleteSessions,
  findClassroomById,
  getCourseWindow,
  getHolidayDates,
  getSessions,
  getSlots,
  getSuspensionDates,
  insertClassroom,
  insertSessionsBatch,
  insertSlot,
  insertSuspension,
  listClassrooms,
  sessionExisteEnFecha,
  upsertHolidays,
  type ClassroomListItem,
  type ClassroomRecord,
  type SessionListItem,
  type SessionRow,
  type SlotRecord,
} from "../infrastructure/scheduling-repository";

type Queryable = Pick<PoolClient, "query">;

export interface SlotInput {
  tipo: "SESION" | "CLUB";
  diaSemana: number; // 0=domingo … 6=sábado
  horaLocal: string; // "HH:MM"
  duracionMin?: number | undefined;
}

/**
 * Materializa en tabla los feriados calculados por código + curados
 * (regla 2: feriados EN TABLA — la regeneración los relee de ahí).
 * Idempotente; el JSON solo suma.
 */
export async function sincronizarFeriados(
  countryCode: string,
  years: number[],
  client?: Queryable,
): Promise<number> {
  let total = 0;
  for (const year of years) {
    const feriados = feriadosDelPais(countryCode, year);
    await upsertHolidays(countryCode, feriados, client);
    total += feriados.length;
  }
  return total;
}

function aniosDeVentana(inicio: string, fin: string): number[] {
  const desde = Number(inicio.slice(0, 4));
  // +1 año de margen: el corrimiento al final puede cruzar de año.
  const hasta = Number(fin.slice(0, 4)) + 1;
  const years: number[] = [];
  for (let y = desde; y <= hasta; y += 1) years.push(y);
  return years;
}

/**
 * (Re)genera TODAS las sesiones del salón dentro de la transacción:
 * BORRA y RECREA desde (inicioCurso, finalCurso, horario), releyendo
 * feriados y suspensiones DE TABLA (sección 2.3). Determinística.
 */
async function generarSesionesTx(
  tx: Queryable,
  classroom: ClassroomRecord,
  slots: SlotRecord[],
): Promise<number> {
  const ventana = await getCourseWindow(classroom.courseId, tx);
  if (ventana === null) {
    throw new NotFoundError("El curso del salón no existe.");
  }
  // Margen amplio para feriados: la última sesión puede correrse meses.
  const feriados = await getHolidayDates(
    classroom.holidayCountry,
    ventana.inicio,
    `${Number(ventana.finalCurso.slice(0, 4)) + 1}-12-31`,
    tx,
  );
  const suspensiones = await getSuspensionDates(classroom.id, tx);
  const noDictables = new Set([...feriados, ...suspensiones]);

  await deleteSessions(tx, classroom.id);

  const rows: SessionRow[] = [];
  for (const slot of slots) {
    const { fechas } = generarFechasSlot({
      inicioCurso: ventana.inicio,
      finalCurso: ventana.finalCurso,
      diaSemana: slot.diaSemana,
      noDictables,
    });
    const [hh, mm] = slot.horaLocal.split(":").map(Number);
    fechas.forEach((fecha, index) => {
      const [y, m, d] = fecha.split("-").map(Number);
      rows.push({
        slotId: slot.id,
        tipo: slot.tipo,
        fecha,
        // Pared de reloj del salón → instante UTC (correcto ante DST chileno).
        startsAt: wallTimeToUtc(
          { year: y ?? 0, month: m ?? 1, day: d ?? 1, hour: hh ?? 0, minute: mm ?? 0 },
          classroom.timezone,
        ),
        duracionMin: slot.duracionMin,
        numero: index + 1,
      });
    });
  }
  await insertSessionsBatch(tx, classroom.id, rows);
  return rows.length;
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Crea un salón con su horario y genera TODAS sus sesiones, en una transacción. */
export async function crearSalon(input: {
  actorUserId: string;
  courseId: string;
  nombre: string;
  guiaUserId?: string | null;
  cupo: number;
  meetingUrl?: string | null;
  timezone: string;
  holidayCountry: string;
  slots: SlotInput[];
  ip?: string | null;
}): Promise<{ id: string; sesionesGeneradas: number }> {
  if (input.slots.length < 1 || input.slots.length > 4) {
    throw new ValidationError("El salón necesita entre 1 y 4 bloques de horario.");
  }
  for (const slot of input.slots) {
    if (!HORA_RE.test(slot.horaLocal)) {
      throw new ValidationError(`Hora inválida: ${slot.horaLocal} (formato HH:MM).`);
    }
    if (slot.diaSemana < 0 || slot.diaSemana > 6) {
      throw new ValidationError("diaSemana debe estar entre 0 (domingo) y 6 (sábado).");
    }
  }
  const clavesSlot = new Set(input.slots.map((s) => `${s.diaSemana}-${s.horaLocal}`));
  if (clavesSlot.size !== input.slots.length) {
    throw new ValidationError("Hay bloques de horario duplicados (mismo día y hora).");
  }
  if (!isValidTimeZone(input.timezone)) {
    throw new ValidationError(`Zona horaria inválida: ${input.timezone}.`);
  }
  const ventana = await getCourseWindow(input.courseId);
  if (ventana === null) {
    throw new NotFoundError("El curso no existe.");
  }

  const resultado = await withTransaction(async (tx) => {
    // Feriados EN TABLA antes de generar (idempotente).
    await sincronizarFeriados(
      input.holidayCountry,
      aniosDeVentana(ventana.inicio, ventana.finalCurso),
      tx,
    );
    const id = await insertClassroom(tx, {
      courseId: input.courseId,
      nombre: input.nombre,
      guiaUserId: input.guiaUserId ?? null,
      cupo: input.cupo,
      meetingUrl: input.meetingUrl ?? null,
      timezone: input.timezone,
      holidayCountry: input.holidayCountry,
    });
    for (const slot of input.slots) {
      await insertSlot(tx, id, { ...slot, duracionMin: slot.duracionMin ?? 60 });
    }
    const classroom = await findClassroomById(id, tx);
    const slots = await getSlots(id, tx);
    const sesionesGeneradas = await generarSesionesTx(tx, classroom as ClassroomRecord, slots);
    return { id, sesionesGeneradas };
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.salon_creado",
    entidad: "scheduling_classroom",
    entidadId: resultado.id,
    payload: {
      nombre: input.nombre,
      slots: input.slots.length,
      sesiones: resultado.sesionesGeneradas,
    },
    ip: input.ip ?? null,
  });
  return resultado;
}

/**
 * REGENERACIÓN destructiva y determinística. Los alumnos (Fase 7) se
 * derivarán de la matrícula, nunca de las inscripciones previas.
 */
export async function regenerarSesiones(input: {
  actorUserId: string;
  classroomId: string;
  ip?: string | null;
}): Promise<{ sesiones: number }> {
  const classroom = await findClassroomById(input.classroomId);
  if (classroom === null) throw new NotFoundError("El salón no existe.");
  const slots = await getSlots(input.classroomId);

  const sesiones = await withTransaction(async (tx) => {
    const ventana = await getCourseWindow(classroom.courseId, tx);
    if (ventana === null) throw new NotFoundError("El curso del salón no existe.");
    await sincronizarFeriados(
      classroom.holidayCountry,
      aniosDeVentana(ventana.inicio, ventana.finalCurso),
      tx,
    );
    return generarSesionesTx(tx, classroom, slots);
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.sesiones_regeneradas",
    entidad: "scheduling_classroom",
    entidadId: classroom.id,
    payload: { sesiones },
    ip: input.ip ?? null,
  });
  return { sesiones };
}

/**
 * Suspende UN día puntual del salón (motivo obligatorio, auditado) y
 * regenera: la sesión de ese día SE CORRE AL FINAL. La suspensión queda EN
 * TABLA — regenerar mil veces la sigue respetando.
 */
export async function suspenderDia(input: {
  actorUserId: string;
  classroomId: string;
  fecha: string;
  motivo: string;
  ip?: string | null;
}): Promise<{ sesiones: number }> {
  if (input.motivo.trim().length < 5) {
    throw new ValidationError("El motivo es obligatorio (mínimo 5 caracteres).");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    throw new ValidationError("Fecha inválida (YYYY-MM-DD).");
  }
  const classroom = await findClassroomById(input.classroomId);
  if (classroom === null) throw new NotFoundError("El salón no existe.");
  const hayeSesion = await sessionExisteEnFecha(input.classroomId, input.fecha);
  if (!hayeSesion) {
    throw new ConflictError(`El salón no tiene sesión programada el ${input.fecha}.`);
  }
  const slots = await getSlots(input.classroomId);

  const sesiones = await withTransaction(async (tx) => {
    await insertSuspension(tx, classroom.id, input.fecha, input.motivo.trim());
    return generarSesionesTx(tx, classroom, slots);
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.dia_suspendido",
    entidad: "scheduling_classroom",
    entidadId: classroom.id,
    payload: { fecha: input.fecha, motivo: input.motivo.trim() },
    ip: input.ip ?? null,
  });
  return { sesiones };
}

export async function listarSalones(courseId?: string): Promise<ClassroomListItem[]> {
  return listClassrooms(courseId);
}

export interface DetalleSalon {
  salon: ClassroomRecord;
  slots: SlotRecord[];
  sesiones: SessionListItem[];
  suspensiones: string[];
  finReal: string | null;
}

export async function detalleSalon(classroomId: string): Promise<DetalleSalon> {
  const salon = await findClassroomById(classroomId);
  if (salon === null) throw new NotFoundError("El salón no existe.");
  const [slots, sesiones, suspensiones] = await Promise.all([
    getSlots(classroomId),
    getSessions(classroomId),
    getSuspensionDates(classroomId),
  ]);
  const soloSesiones = sesiones.filter((s) => s.tipo === "SESION");
  return {
    salon,
    slots,
    sesiones,
    suspensiones: suspensiones.sort(),
    finReal: soloSesiones.at(-1)?.fecha ?? null,
  };
}
