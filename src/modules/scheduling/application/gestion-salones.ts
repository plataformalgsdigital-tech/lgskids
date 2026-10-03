import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { isValidTimeZone, wallTimeToUtc } from "@/platform/time";
import { feriadosDelPais } from "../domain/feriados";
import { generarFechasSlot } from "../domain/generacion";
import {
  agendaSesiones,
  campaniaTieneMatriculas,
  classroomExisteNombre,
  classroomTieneMatriculas,
  deleteClassroomsDeCampania,
  congelarGuiaSesionesPasadas,
  contarSesionesFuturas,
  coursesDeCampania,
  deleteClassroom,
  deleteSessions,
  detalleSesion,
  findClassroomById,
  listHorariosCatalogo,
  getCourseWindow,
  getHolidayDates,
  getSessions,
  getSlots,
  getSuspensionDates,
  historiaDeCampania,
  insertClassroom,
  insertSessionsBatch,
  salonesDeCampania,
  setCourseVentana,
  getSalonCampania,
  insertSlot,
  insertSuspension,
  listClassrooms,
  ninosDeGuia,
  sessionExisteEnFecha,
  soltarGuiaSesionesFuturas,
  updateClassroom,
  updateGuiaSalon,
  updateGuiaSesion,
  upsertHolidays,
  type AgendaItem,
  type ClassroomListItem,
  type ClassroomRecord,
  type NinoDeGuia,
  type SalonCampania,
  type SesionDetalle,
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
        // Se renumera abajo: aquí el índice es el del SLOT, no el del curso.
        numero: index + 1,
      });
    });
  }
  // EL NÚMERO ES DEL CURSO, no del día de la semana. Con dos días por semana el
  // índice por slot daba dos "Sesión 1", dos "Sesión 2"… y en la pantalla del
  // salón parecían sesiones duplicadas. Van 1..N en orden cronológico.
  // Y POR TIPO (2026-10-03): las clases y los clubes llevan cada uno su
  // cuenta. Contados juntos, cada club corría un puesto a las clases que venían
  // después, y la lección de cada sesión sale de ese puesto.
  rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const porTipo = new Map<string, number>();
  for (const row of rows) {
    const n = (porTipo.get(row.tipo) ?? 0) + 1;
    porTipo.set(row.tipo, n);
    row.numero = n;
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

export interface ImpactoFinPrograma {
  /** Fin nominal que tienen hoy los cursos de la campaña. */
  finActual: string;
  finNuevo: string;
  salones: { nombre: string; ahora: number; despues: number }[];
  totalAhora: number;
  totalDespues: number;
  /** Lo que la regeneración BORRARÍA: por eso se bloquea si hay algo. */
  conAsistencia: number;
  cerradas: number;
}

/**
 * Qué pasaría si el programa corriera en otra ventana, SIN tocar nada.
 *
 * Se simula con la MISMA función pura que genera (`generarFechasSlot`), no con
 * una cuenta aparte: si mañana cambia la regla de corrimiento por feriados, el
 * previo cambia con ella y no se vuelve una promesa falsa.
 */
export async function impactoFinDePrograma(
  campaignId: string,
  finNuevo: string,
  inicioNuevo?: string,
): Promise<ImpactoFinPrograma> {
  const cursos = await coursesDeCampania(campaignId);
  if (cursos.length === 0) throw new NotFoundError("La campaña no tiene cursos.");
  const ventana = await getCourseWindow(cursos[0]?.courseId ?? "");
  if (ventana === null) throw new NotFoundError("El curso de la campaña no existe.");

  const salones = await salonesDeCampania(campaignId);
  const filas: ImpactoFinPrograma["salones"] = [];
  for (const salon of salones) {
    const inicio = inicioNuevo ?? salon.cursoInicio;
    const slots = await getSlots(salon.id);
    const feriados = await getHolidayDates(
      salon.holidayCountry,
      inicio,
      `${Number(finNuevo.slice(0, 4)) + 1}-12-31`,
    );
    const suspensiones = await getSuspensionDates(salon.id);
    const noDictables = new Set([...feriados, ...suspensiones]);
    const despues = slots.reduce(
      (total, slot) =>
        total +
        generarFechasSlot({
          inicioCurso: inicio,
          finalCurso: finNuevo,
          diaSemana: slot.diaSemana,
          noDictables,
        }).fechas.length,
      0,
    );
    filas.push({ nombre: salon.nombre, ahora: salon.sesiones, despues });
  }

  const historia = await historiaDeCampania(campaignId);
  return {
    finActual: ventana.finalCurso,
    finNuevo,
    salones: filas,
    totalAhora: filas.reduce((t, f) => t + f.ahora, 0),
    totalDespues: filas.reduce((t, f) => t + f.despues, 0),
    ...historia,
  };
}

/**
 * Mueve la VENTANA DEL PROGRAMA de toda la campaña (inicio y/o fin): reescribe
 * `inicio`/`final_curso` de sus cursos y regenera las sesiones de TODOS sus
 * salones, en una transacción.
 *
 * Se BLOQUEA si alguna sesión ya tiene asistencia o está cerrada. Regenerar es
 * destructivo y la asistencia cuelga de la sesión con ON DELETE CASCADE: mover
 * la ventana con el curso andando se llevaría el registro de lo ya dictado, en
 * silencio. Con el curso empezado, lo que se alarga o recorta son sesiones
 * sueltas (evento extra o suspensión), no la ventana entera.
 */
export async function moverFinDePrograma(input: {
  actorUserId: string;
  campaignId: string;
  fin: string;
  /** Inicio nuevo del programa; si no viene, cada curso conserva el suyo. */
  inicio?: string | undefined;
  ip?: string | null;
}): Promise<{ salones: number; sesiones: number }> {
  const historia = await historiaDeCampania(input.campaignId);
  if (historia.conAsistencia > 0 || historia.cerradas > 0) {
    throw new ConflictError(
      `No se puede mover la ventana del programa: ya hay ${String(historia.conAsistencia)} sesión(es) con asistencia y ${String(historia.cerradas)} cerrada(s), y regenerar las borraría. Usa una suspensión o una sesión extra.`,
    );
  }
  const cursos = await coursesDeCampania(input.campaignId);
  if (cursos.length === 0) throw new NotFoundError("La campaña no tiene cursos.");
  if (input.inicio !== undefined && input.inicio >= input.fin) {
    throw new ValidationError("El inicio del programa debe ser anterior a su fin.");
  }

  const resultado = await withTransaction(async (tx) => {
    let sesiones = 0;
    let salones = 0;
    for (const curso of cursos) {
      await setCourseVentana(curso.courseId, { inicio: input.inicio, finalCurso: input.fin }, tx);
      for (const salon of await listClassrooms(curso.courseId)) {
        const classroom = await findClassroomById(salon.id, tx);
        if (classroom === null) continue;
        await sincronizarFeriados(
          classroom.holidayCountry,
          aniosDeVentana(input.inicio ?? salon.primeraSesion ?? input.fin, input.fin),
          tx,
        );
        sesiones += await generarSesionesTx(tx, classroom, await getSlots(salon.id, tx));
        salones += 1;
      }
    }
    return { salones, sesiones };
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.fin_programa_movido",
    entidad: "catalog_campaign",
    entidadId: input.campaignId,
    payload: { fin: input.fin, inicio: input.inicio ?? null, ...resultado },
    ip: input.ip ?? null,
  });
  return resultado;
}

/** Matrículas (vivas o históricas) de toda la campaña: lo que impide borrarla. */
export async function matriculasDeCampania(campaignId: string): Promise<number> {
  return campaniaTieneMatriculas(campaignId);
}

/**
 * Borra los salones de una campaña DENTRO de la transacción de quien la
 * elimina (`catalog`). Va aquí porque las tablas son de este módulo, y se pasa
 * el `tx` para que campaña y salones caigan juntos o no caiga ninguno.
 */
export async function eliminarSalonesDeCampaniaTx(
  tx: Queryable,
  campaignId: string,
): Promise<number> {
  return deleteClassroomsDeCampania(campaignId, tx);
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

export async function listarSalones(
  courseId?: string,
  guiaUserId?: string,
): Promise<ClassroomListItem[]> {
  return listClassrooms(courseId, guiaUserId);
}

/** Agenda del mes: sesiones entre dos fechas (opcionalmente por campaña o guía). */
export async function agenda(input: {
  desde: string;
  hasta: string;
  campaignId?: string | undefined;
  guiaUserId?: string | undefined;
}): Promise<AgendaItem[]> {
  return agendaSesiones(input.desde, input.hasta, {
    campaignId: input.campaignId,
    guiaUserId: input.guiaUserId,
  });
}

/** Niños de los salones del guía (panel del guía). */
export async function misNinosDeGuia(guiaUserId: string): Promise<NinoDeGuia[]> {
  return ninosDeGuia(guiaUserId);
}

/** Detalle de una sesión (info del evento + salón + curso + guía). */
export async function obtenerDetalleSesion(sessionId: string): Promise<SesionDetalle> {
  const detalle = await detalleSesion(sessionId);
  if (detalle === null) throw new NotFoundError("La sesión no existe.");
  return detalle;
}

/** Qué movió un cambio de guía del salón. */
export interface CambioDeGuia {
  /** Sesiones ya empezadas a las que se les fijó el guía saliente. */
  pasadasCongeladas: number;
  /** Sesiones de hoy en adelante que pasan al guía nuevo. */
  futurasAsignadas: number;
  /** De esas, las que tenían guía propio de un día y se soltaron. */
  futurasSoltadas: number;
}

/**
 * EL ÚNICO lugar donde cambia el guía de un salón, para que el wizard y el
 * calendario no puedan divergir. El cambio mira ADELANTE:
 *
 *  - las sesiones YA EMPEZADAS conservan a quien las dictó: se les escribe el
 *    guía saliente antes de tocar el salón (antes lo heredaban, así que el
 *    cambio les reescribía el pasado);
 *  - las FUTURAS pasan al guía nuevo, incluidas las que tuvieran un guía
 *    puesto para ese día suelto: se sueltan para que vuelvan a heredar.
 *
 * Va todo en una transacción: congelar el pasado sin cambiar el salón dejaría
 * el histórico escrito con un cambio que no ocurrió.
 */
async function aplicarGuiaDeSalon(
  client: Queryable,
  classroomId: string,
  guiaSaliente: string | null,
  guiaNuevo: string | null,
): Promise<CambioDeGuia> {
  const pasadasCongeladas =
    guiaSaliente === null
      ? 0
      : await congelarGuiaSesionesPasadas(classroomId, guiaSaliente, client);
  await updateGuiaSalon(classroomId, guiaNuevo, client);
  const futurasSoltadas = await soltarGuiaSesionesFuturas(classroomId, client);
  const futurasAsignadas = await contarSesionesFuturas(classroomId, client);
  return { pasadasCongeladas, futurasAsignadas, futurasSoltadas };
}

/** Cambia el guía de un salón (null = quitar). Auditado; no toca el horario. */
export async function cambiarGuia(input: {
  actorUserId: string;
  classroomId: string;
  guiaUserId: string | null;
  ip?: string | null;
}): Promise<CambioDeGuia> {
  const classroom = await findClassroomById(input.classroomId);
  if (classroom === null) throw new NotFoundError("El salón no existe.");
  const cambio = await withTransaction((client) =>
    aplicarGuiaDeSalon(client, input.classroomId, classroom.guiaUserId, input.guiaUserId),
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.guia_cambiado",
    entidad: "scheduling_classroom",
    entidadId: input.classroomId,
    payload: { guiaAnterior: classroom.guiaUserId, guiaNuevo: input.guiaUserId, ...cambio },
    ip: input.ip ?? null,
  });
  return cambio;
}

/**
 * Cambia el guía de UNA sesión (null = vuelve a heredar el del salón). Es el
 * reemplazo de un día —el guía titular no puede— y por eso NO toca el salón ni
 * las demás sesiones. Se guarda en `scheduling_session.guia_user_id`, la misma
 * columna que fija el cierre, así que la estadística mensual ya lo cuenta.
 */
export async function cambiarGuiaDeSesion(input: {
  actorUserId: string;
  sessionId: string;
  guiaUserId: string | null;
  ip?: string | null;
}): Promise<{ guia: SesionDetalle["guia"] }> {
  const antes = await detalleSesion(input.sessionId);
  if (antes === null) throw new NotFoundError("La sesión no existe.");
  await updateGuiaSesion(input.sessionId, input.guiaUserId);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.guia_sesion_cambiado",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: {
      classroomId: antes.salon.id,
      fecha: antes.sesion.fecha,
      guiaAnterior: antes.guia?.userId ?? null,
      guiaNuevo: input.guiaUserId,
    },
    ip: input.ip ?? null,
  });
  const despues = await detalleSesion(input.sessionId);
  return { guia: despues?.guia ?? null };
}

/** Sesiones del salón que están por venir: lo que movería un cambio de guía. */
export async function sesionesFuturasDelSalon(classroomId: string): Promise<number> {
  return contarSesionesFuturas(classroomId);
}

export interface DetalleSalon {
  salon: ClassroomRecord;
  slots: SlotRecord[];
  sesiones: SessionListItem[];
  suspensiones: string[];
  finReal: string | null;
  campania: SalonCampania | null;
}

export async function detalleSalon(classroomId: string): Promise<DetalleSalon> {
  const salon = await findClassroomById(classroomId);
  if (salon === null) throw new NotFoundError("El salón no existe.");
  const [slots, sesiones, suspensiones, campania] = await Promise.all([
    getSlots(classroomId),
    getSessions(classroomId),
    getSuspensionDates(classroomId),
    getSalonCampania(salon.courseId),
  ]);
  const soloSesiones = sesiones.filter((s) => s.tipo === "SESION");
  return {
    salon,
    slots,
    sesiones,
    suspensiones: suspensiones.sort(),
    finReal: soloSesiones.at(-1)?.fecha ?? null,
    campania,
  };
}

/** Edita cupo, guía y activo de un salón (no toca el horario). Al desactivarlo,
 * deja de ofrecerse en el wizard de contratos y en el intake de LGS. */
export async function editarSalon(input: {
  actorUserId: string;
  classroomId: string;
  cupo?: number | undefined;
  guiaUserId?: string | null | undefined;
  activo?: boolean | undefined;
  ip?: string | null;
}): Promise<CambioDeGuia> {
  const salon = await findClassroomById(input.classroomId);
  if (salon === null) throw new NotFoundError("El salón no existe.");

  const cupo = input.cupo ?? salon.cupo;
  if (!Number.isInteger(cupo) || cupo < 1 || cupo > 50) {
    throw new ValidationError("El cupo debe ser un entero entre 1 y 50.");
  }
  const guiaUserId = input.guiaUserId !== undefined ? input.guiaUserId : salon.guiaUserId;
  const activo = input.activo ?? salon.activo;
  const cambiaGuia = guiaUserId !== salon.guiaUserId;

  // Guardar el salón y reacomodar sus sesiones es UNA operación: si lo segundo
  // falla, el guía nuevo no puede quedar puesto con el histórico a medias.
  const cambio = await withTransaction(async (client) => {
    await updateClassroom(input.classroomId, { cupo, guiaUserId, activo }, client);
    return cambiaGuia
      ? await aplicarGuiaDeSalon(client, input.classroomId, salon.guiaUserId, guiaUserId)
      : { pasadasCongeladas: 0, futurasAsignadas: 0, futurasSoltadas: 0 };
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.salon_editado",
    entidad: "scheduling_classroom",
    entidadId: input.classroomId,
    payload: {
      cupo,
      guiaUserId,
      activo,
      ...(cambiaGuia && { guiaAnterior: salon.guiaUserId, ...cambio }),
    },
    ip: input.ip ?? null,
  });
  return cambio;
}

const TZ_POR_GRUPO: Record<string, string> = {
  "01": "America/Santiago",
  "02": "America/Bogota", // CO/EC/PE comparten UTC-5
};
const PAIS_POR_GRUPO: Record<string, string> = { "01": "CL", "02": "CO" };

/**
 * Crea los salones de una campaña DESDE EL CATÁLOGO de horarios: un salón por
 * cada horario activo del tipo de curso (ambos grupos de país), con la GUÍA
 * PENDIENTE (null) y cupo por defecto. Idempotente: omite los salones que ya
 * existan (por nombre). Cada salón genera sus sesiones.
 */
export async function generarSalonesDesdeCatalogo(input: {
  actorUserId: string;
  campaignId: string;
  cupo?: number | undefined;
  ip?: string | null;
}): Promise<{ creados: number; omitidos: number; salones: string[] }> {
  const courses = await coursesDeCampania(input.campaignId);
  if (courses.length === 0) {
    throw new NotFoundError("La campaña no existe o no tiene cursos.");
  }
  const horarios = await listHorariosCatalogo({ soloActivos: true });
  const cupo = input.cupo ?? 12;
  let creados = 0;
  let omitidos = 0;
  const salones: string[] = [];

  for (const course of courses) {
    for (const h of horarios.filter((x) => x.tipoCurso === course.tipo)) {
      const nombre = `${course.tipo} Salón ${h.salonNumero}`;
      if (await classroomExisteNombre(course.courseId, nombre)) {
        omitidos += 1;
        continue;
      }
      await crearSalon({
        actorUserId: input.actorUserId,
        courseId: course.courseId,
        nombre,
        guiaUserId: null, // guía PENDIENTE de asignar
        cupo,
        timezone: TZ_POR_GRUPO[h.grupoPais] ?? "America/Santiago",
        holidayCountry: PAIS_POR_GRUPO[h.grupoPais] ?? "CL",
        slots: h.slots.map((s) => ({
          tipo: s.tipo as "SESION" | "CLUB",
          diaSemana: s.diaSemana,
          horaLocal: s.horaLocal,
          duracionMin: s.duracionMin,
        })),
        ip: input.ip ?? null,
      });
      creados += 1;
      salones.push(nombre);
    }
  }

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.salones_generados_catalogo",
    entidad: "catalog_campaign",
    entidadId: input.campaignId,
    payload: { creados, omitidos },
    ip: input.ip ?? null,
  });
  return { creados, omitidos, salones };
}

/** Elimina un salón (y sus sesiones/slots/suspensiones). Se BLOQUEA si el salón
 * tiene matrículas (activas, reservadas o históricas): en ese caso hay que
 * desactivarlo, no borrarlo. */
export async function eliminarSalon(input: {
  actorUserId: string;
  classroomId: string;
  ip?: string | null;
}): Promise<void> {
  const salon = await findClassroomById(input.classroomId);
  if (salon === null) throw new NotFoundError("El salón no existe.");
  if (await classroomTieneMatriculas(input.classroomId)) {
    throw new ConflictError(
      "No se puede eliminar: el salón tiene matrículas (activas o históricas). Desactívalo en su lugar.",
    );
  }
  await withTransaction((tx) => deleteClassroom(tx, input.classroomId));
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.salon_eliminado",
    entidad: "scheduling_classroom",
    entidadId: input.classroomId,
    payload: { nombre: salon.nombre },
    ip: input.ip ?? null,
  });
}
