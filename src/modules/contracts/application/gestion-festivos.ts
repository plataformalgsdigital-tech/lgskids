import { SQL_SECUENCIA_LECCIONES } from "@/modules/catalog";
import {
  SQL_ORDINAL_CLASE,
  festivoDe,
  ninoAfectadoPorFestivo,
  type OpcionAgenda,
} from "@/modules/scheduling";
import { queryRows } from "@/platform/db/query";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { agendarParaNino, opcionesAgendaNino } from "./perfil-nino";

/**
 * GESTIÓN FESTIVOS — a qué clase puede pasar, solo ese día, el niño que el feriado
 * de OTRO país deja sin clase (ver `scheduling/application/festivos.ts`).
 *
 * No hay un camino nuevo de matrícula ni de lista: aprobar es AGENDAR (regla de
 * cohortes: la lista de una clase sale de su salón y `scheduling_agendado` suma a
 * un niño a UNA sesión). Por eso la regla, el cupo con bloqueo, el choque de horario
 * y la auditoría son los de siempre; esto añade el motivo y la validación de que el
 * niño es de los afectados.
 */

export interface SugerenciaFestivo extends OpcionAgenda {
  /** Lección que se dicta en esa clase (derivada como en el calendario). */
  leccion: LeccionDeSesion | null;
  /** Diferencia de hora con la clase que no se dicta, en minutos (siempre ≥ 0). */
  diferenciaMin: number;
  /** ¿Es la MISMA lección que el niño habría tenido? null si no se pudo derivar. */
  mismaLeccion: boolean | null;
  /** La mejor opción libre: sin choque, con cupo y lo más parecida en hora y lección. */
  recomendada: boolean;
}

/**
 * Por qué puede no haber a dónde pasar al niño ese día. El caso real: el feriado cae en
 * TODOS los calendarios que usan los salones activos (p. ej. el 8-dic, feriado en Chile y
 * en Colombia), así que ningún salón dicta clase y no hay opción que ofrecer.
 */
export interface DiagnosticoFestivo {
  /** La clase que se pierde ya empezó: no hay a dónde pasarlo. */
  fechaPasada: boolean;
  /** Países de los calendarios de los salones ACTIVOS (CL, CO…). */
  calendariosActivos: string[];
  /** De esos, los que tienen feriado ese día. */
  calendariosConFeriado: string[];
}

export interface SugerenciasFestivo {
  /** La lección que el niño habría tenido en su salón ese día. */
  leccionPerdida: LeccionDeSesion | null;
  opciones: SugerenciaFestivo[];
  diagnostico: DiagnosticoFestivo;
}

export interface LeccionDeSesion {
  nivel: string;
  leccion: string;
  /** Puesto de la lección en el curso (1..N): sirve para comparar dos clases. */
  n: number;
}

/**
 * La lección que se dicta en cada una de esas clases del horario, derivada como en
 * el calendario: la clase N del salón es la N-ésima lección del catálogo de su curso.
 */
async function leccionesDeSesiones(ids: string[]): Promise<Map<string, LeccionDeSesion>> {
  if (ids.length === 0) return new Map();
  const filas = await queryRows<{ id: string; nivel: string; leccion: string; n: number }>(
    `WITH ord AS ${SQL_ORDINAL_CLASE}, sec AS ${SQL_SECUENCIA_LECCIONES}
     SELECT s.id, sec.nivel, sec.leccion, sec.n::int AS n
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN ord ON ord.session_id = s.id
       JOIN sec ON sec.curso = cu.tipo AND sec.n = ord.n
      WHERE s.id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(filas.map((f) => [f.id, { nivel: f.nivel, leccion: f.leccion, n: f.n }]));
}

/**
 * La lección que el niño habría tenido en la clase que su salón no dicta: la
 * SIGUIENTE a las que ya van antes de ese instante (la clase corrida al final
 * toma ese mismo puesto).
 */
async function leccionQueSeSalta(
  classroomId: string,
  instante: string,
): Promise<LeccionDeSesion | null> {
  const [f] = await queryRows<{ nivel: string; leccion: string; n: number }>(
    `WITH sec AS ${SQL_SECUENCIA_LECCIONES},
          previas AS (
            SELECT count(*)::int AS c FROM scheduling_session s
             WHERE s.classroom_id = $1 AND s.tipo = 'SESION' AND s.slot_id IS NOT NULL
               AND s.starts_at < $2::timestamptz)
     SELECT sec.nivel, sec.leccion, sec.n::int AS n
       FROM scheduling_classroom cl
       JOIN catalog_course cu ON cu.id = cl.course_id
       CROSS JOIN previas
       JOIN sec ON sec.curso = cu.tipo AND sec.n = previas.c + 1
      WHERE cl.id = $1`,
    [classroomId, instante],
  );
  return f === undefined ? null : { nivel: f.nivel, leccion: f.leccion, n: f.n };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Las clases regulares de ese día a las que se puede pasar al niño, de mejor a peor.
 * Por defecto, las de SU campaña y SU curso; con `amplio`, las de cualquier campaña,
 * curso y salón (lo elige coordinación, que verá el aviso si el curso no es el suyo).
 */
export async function sugerenciasFestivo(input: {
  childPersonId: string;
  countryScope: string[] | null;
  fecha: string;
  /** El instante de la clase que el niño no tendrá (el de la lista de impacto). */
  perdidaStartsAt: string;
  classroomId: string;
  amplio?: boolean;
}): Promise<SugerenciasFestivo> {
  if (!FECHA.test(input.fecha)) throw new ValidationError("La fecha debe ser YYYY-MM-DD.");
  const perdida = new Date(input.perdidaStartsAt);
  if (Number.isNaN(perdida.getTime())) throw new ValidationError("El instante no es válido.");

  const todas = await opcionesAgendaNino({
    childPersonId: input.childPersonId,
    countryScope: input.countryScope,
    tipo: "REGULAR",
    fecha: input.fecha,
    ...(input.amplio === true && { amplio: true }),
  });
  // Su propio salón no dicta ese día; si aparece, no es una opción.
  const candidatas = todas.filter((o) => !o.propia);

  const [lecciones, leccionPerdida] = await Promise.all([
    leccionesDeSesiones(candidatas.map((o) => o.id)),
    leccionQueSeSalta(input.classroomId, perdida.toISOString()),
  ]);

  const opciones: SugerenciaFestivo[] = candidatas.map((o) => {
    const leccion = lecciones.get(o.id) ?? null;
    return {
      ...o,
      leccion,
      diferenciaMin: Math.round(
        Math.abs(new Date(o.startsAt).getTime() - perdida.getTime()) / 60_000,
      ),
      mismaLeccion:
        leccion === null || leccionPerdida === null ? null : leccion.n === leccionPerdida.n,
      recomendada: false,
    };
  });

  // Libres primero (sin choque, con cupo); luego la misma lección; luego la hora más cercana.
  const libre = (o: SugerenciaFestivo) => (o.choque === null && !o.lleno ? 0 : 1);
  opciones.sort(
    (a, b) =>
      libre(a) - libre(b) ||
      Number(b.mismaLeccion === true) - Number(a.mismaLeccion === true) ||
      a.diferenciaMin - b.diferenciaMin ||
      a.salon.localeCompare(b.salon),
  );
  const mejor = opciones.find((o) => libre(o) === 0 && !o.enSuLista);
  if (mejor !== undefined) mejor.recomendada = true;
  const [activos, feriados] = await Promise.all([
    queryRows<{ pais: string }>(
      `SELECT DISTINCT holiday_country::text AS pais FROM scheduling_classroom WHERE activo`,
    ),
    queryRows<{ pais: string }>(
      `SELECT DISTINCT country_code::text AS pais FROM scheduling_holiday WHERE fecha = $1::date`,
      [input.fecha],
    ),
  ]);
  const calendariosActivos = activos.map((a) => a.pais).sort();
  const conFeriado = new Set(feriados.map((f) => f.pais));
  return {
    leccionPerdida,
    opciones,
    diagnostico: {
      fechaPasada: perdida.getTime() < Date.now(),
      calendariosActivos,
      calendariosConFeriado: calendariosActivos.filter((c) => conFeriado.has(c)),
    },
  };
}

/**
 * Aprueba el cambio TEMPORAL: pasa al niño a esa clase, solo ese día. El servidor
 * vuelve a comprobar que el feriado existe y que el niño es de los afectados; la
 * regla, el cupo y el choque los vuelve a mirar el agendado.
 */
export async function aprobarCambioFestivo(input: {
  actorUserId: string;
  childPersonId: string;
  countryScope: string[] | null;
  /** País y fecha del feriado que se está atendiendo. */
  pais: string;
  fecha: string;
  /** La clase a la que pasa (se elige entre las sugerencias). */
  sessionId: string;
  amplio?: boolean;
  autorizarSobrecupo: boolean;
  puedeSobrecupo: boolean;
  ip?: string | null;
}): Promise<{ startsAt: string; sobrecupo: boolean }> {
  if (!FECHA.test(input.fecha)) throw new ValidationError("La fecha debe ser YYYY-MM-DD.");
  const festivo = await festivoDe(input.pais, input.fecha);
  if (festivo === null) throw new NotFoundError("Ese feriado no existe.");
  if (
    !(await ninoAfectadoPorFestivo({
      childPersonId: input.childPersonId,
      pais: input.pais,
      fecha: input.fecha,
    }))
  ) {
    throw new ConflictError("Ese feriado no deja a este niño sin clase.");
  }
  return agendarParaNino({
    actorUserId: input.actorUserId,
    childPersonId: input.childPersonId,
    countryScope: input.countryScope,
    tipo: "REGULAR",
    id: input.sessionId,
    autorizarSobrecupo: input.autorizarSobrecupo,
    puedeSobrecupo: input.puedeSobrecupo,
    ...(input.amplio === true && { amplio: true }),
    motivo: `Festivo ${input.pais} ${input.fecha}: ${festivo.nombre}`,
    ip: input.ip ?? null,
  });
}
