import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  FUENTE_FERIADO_PROPIO,
  feriadosEntre,
  findClassroomById,
  getSlots,
} from "../infrastructure/scheduling-repository";
import {
  aplicarPlanFuturasTx,
  planCambia,
  planDeFuturas,
  type AjusteFeriados,
  type PlanFuturas,
} from "./gestion-salones";

/**
 * FERIADOS PROPIOS (Académica › Sesiones › Feriados, 2026-11-18).
 *
 * Un feriado propio es una fila más de `scheduling_holiday` (fuente MANUAL), de UNA
 * fecha concreta —no se repite cada año—, para uno o varios países. Rige igual que los
 * de código: el salón con ese país en su calendario no dicta ese día y la sesión se
 * agrega AL FINAL (el total se conserva, `final_curso` no se toca). Los niños de otro
 * país en esos salones quedan en Gestión Festivos, que lee la misma tabla.
 *
 * Tres cuidados, decididos con el negocio:
 *  - Solo se ajustan las sesiones FUTURAS. Regenerar el salón entero borraría también
 *    lo ya dictado, y la asistencia cuelga de la sesión con ON DELETE CASCADE.
 *  - La última sesión no puede pasar del `final_contrato` de un niño del salón. Un
 *    salón así NO se toca: el feriado se guarda, el salón queda PENDIENTE con los
 *    niños a la vista y coordinación decide (p. ej. ampliar esos contratos).
 *  - Lo pendiente se DERIVA (el calendario que le toca contra el que tiene): no hay
 *    una tabla de pendientes que se desincronice.
 */

export const PAISES_FERIADO = ["CL", "CO", "EC", "PE"] as const;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
export const NOMBRE_MIN = 3;
export const NOMBRE_MAX = 100;

export interface FeriadoDelMes {
  pais: string;
  fecha: string;
  nombre: string;
  fuente: string;
  /** Lo escribió una persona: es lo único que se puede quitar. */
  propio: boolean;
}

export interface ConflictoContrato {
  nombre: string;
  documento: string;
  finContrato: string;
}

export interface SalonImpactoFeriado {
  id: string;
  nombre: string;
  pais: string;
  curso: string;
  campania: string;
  /** Fechas locales de las sesiones que el cambio quita y de las que agrega. */
  quita: string[];
  agrega: string[];
  finActual: string | null;
  finNuevo: string | null;
  conflictos: ConflictoContrato[];
  /** Por qué no se puede aplicar solo (asistencia o cierre en lo que se quitaría). */
  bloqueo: string | null;
  aplicable: boolean;
}

export interface PrevioFeriado {
  accion: "AGREGAR" | "QUITAR";
  fecha: string;
  paises: string[];
  /** Países que YA tienen feriado ese día: no se tocan. */
  paisesYaTienen: string[];
  salones: SalonImpactoFeriado[];
  /** Niños de OTRO país en esos salones que quedan sin clase (van a Gestión Festivos). */
  ninosOtroPais: number;
}

export interface ResultadoFeriado {
  fecha: string;
  paises: string[];
  regenerados: { id: string; nombre: string }[];
  pendientes: { id: string; nombre: string; motivo: string; conflictos: ConflictoContrato[] }[];
}

// ── Validación ────────────────────────────────────────────────────────────

function fechaValida(fecha: string): boolean {
  if (!FECHA.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

async function hoyBogota(): Promise<string> {
  const [f] = await queryRows<{ hoy: string }>(
    `SELECT (now() AT TIME ZONE 'America/Bogota')::date::text AS hoy`,
  );
  return f?.hoy ?? new Date().toISOString().slice(0, 10);
}

async function exigirFechaFutura(fecha: string): Promise<void> {
  if (!fechaValida(fecha)) throw new ValidationError("La fecha debe ser YYYY-MM-DD y existir.");
  if (fecha <= (await hoyBogota())) {
    throw new ValidationError("Solo se crean o se quitan feriados de fechas futuras.");
  }
}

function paisesValidos(paises: string[], countryScope: string[] | null): string[] {
  const unicos = [...new Set(paises.map((p) => p.trim().toUpperCase()))];
  if (unicos.length === 0) throw new ValidationError("Marca al menos un país.");
  for (const p of unicos) {
    if (!(PAISES_FERIADO as readonly string[]).includes(p)) {
      throw new ValidationError(`País no válido: ${p}.`);
    }
    if (countryScope !== null && !countryScope.includes(p)) {
      throw new ForbiddenError(`Tu rol no gestiona el país ${p}.`);
    }
  }
  return unicos;
}

// ── Lectura ───────────────────────────────────────────────────────────────

/** Los feriados de un mes (YYYY-MM), de todos los países: es información pública. */
export async function feriadosDelMes(mes: string): Promise<FeriadoDelMes[]> {
  if (!MES.test(mes)) throw new ValidationError("El mes debe ser YYYY-MM.");
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const filas = await feriadosEntre(`${mes}-01`, `${mes}-${String(ultimo).padStart(2, "0")}`);
  return filas.map((f) => ({ ...f, propio: f.fuente === FUENTE_FERIADO_PROPIO }));
}

interface SalonCandidato {
  id: string;
  nombre: string;
  pais: string;
  curso: string;
  campania: string;
}

/** Salones con ese país en su calendario y sesiones por delante: los únicos a los que un feriado nuevo llega. */
async function salonesCandidatos(paises: string[], fecha?: string): Promise<SalonCandidato[]> {
  // Un feriado solo mueve las sesiones de SU fecha: con ella, basta mirar los salones que
  // tienen un bloque de horario ese día de la semana (evita simular todos los demás).
  const conBloqueEseDia =
    fecha === undefined
      ? ""
      : `AND EXISTS (SELECT 1 FROM scheduling_slot sl
                      WHERE sl.classroom_id = cl.id
                        AND sl.dia_semana = EXTRACT(DOW FROM $2::date)::int)`;
  return queryRows<SalonCandidato>(
    `SELECT cl.id, cl.nombre, cl.holiday_country::text AS pais, cu.tipo::text AS curso,
            ca.nombre AS campania
       FROM scheduling_classroom cl
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
      WHERE cl.holiday_country::text = ANY($1::text[])
        AND EXISTS (SELECT 1 FROM scheduling_session s
                     WHERE s.classroom_id = cl.id AND s.slot_id IS NOT NULL
                       AND s.starts_at > now())
        ${conBloqueEseDia}
      ORDER BY ca.inicio DESC, cu.tipo, cl.nombre`,
    fecha === undefined ? [paises] : [paises, fecha],
  );
}

/** Niños con matrícula ACTIVA cuyo contrato vence ANTES de esa fecha. */
async function conflictosDeContrato(
  classroomId: string,
  finDeseado: string | null,
): Promise<ConflictoContrato[]> {
  if (finDeseado === null) return [];
  return queryRows<ConflictoContrato>(
    `SELECT trim(p.nombres || ' ' || p.apellidos) AS nombre, p.doc_numero AS documento,
            ct.final_contrato::text AS "finContrato"
       FROM enrollment_enrollment e
       JOIN contracts_contract ct ON ct.id = e.contract_id
       JOIN people_person p ON p.id = e.child_person_id
      WHERE e.classroom_id = $1 AND e.estado = 'ACTIVA'
        AND ct.estado::text IN ('APROBADO', 'ONHOLD')
        AND ct.final_contrato < $2::date
      ORDER BY ct.final_contrato, p.apellidos, p.nombres
      LIMIT 50`,
    [classroomId, finDeseado],
  );
}

function fechasDe(filas: { startsAt: Date }[], zona: string): string[] {
  return filas
    .map((f) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zona,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(f.startsAt),
    )
    .sort();
}

function motivoDeBloqueo(plan: PlanFuturas): string | null {
  const n = plan.aBorrar.filter((s) => s.conHistoria).length;
  return n === 0
    ? null
    : `Ya hay asistencia o cierre en ${String(n)} sesión(es) que el cambio quitaría.`;
}

async function impactoDeSalon(
  c: SalonCandidato,
  ajuste: AjusteFeriados | undefined,
): Promise<{ impacto: SalonImpactoFeriado; plan: PlanFuturas } | null> {
  const classroom = await findClassroomById(c.id);
  if (classroom === null) return null;
  const plan = await planDeFuturas(undefined, classroom, await getSlots(c.id), ajuste);
  if (!planCambia(plan)) return null;
  const conflictos = await conflictosDeContrato(c.id, plan.finDeseado);
  const bloqueo = motivoDeBloqueo(plan);
  return {
    plan,
    impacto: {
      id: c.id,
      nombre: c.nombre,
      pais: c.pais,
      curso: c.curso,
      campania: c.campania,
      quita: fechasDe(plan.aBorrar, classroom.timezone),
      agrega: plan.aInsertar.map((r) => r.fecha).sort(),
      finActual: plan.finActual,
      finNuevo: plan.finDeseado,
      conflictos,
      bloqueo,
      aplicable: bloqueo === null && conflictos.length === 0,
    },
  };
}

async function contarNinosOtroPais(
  classroomIds: string[],
  paises: string[],
  fecha: string,
): Promise<number> {
  if (classroomIds.length === 0) return 0;
  const [f] = await queryRows<{ n: number }>(
    `SELECT count(DISTINCT p.id)::int AS n
       FROM enrollment_enrollment e
       JOIN people_person p ON p.id = e.child_person_id
      WHERE e.classroom_id = ANY($1::uuid[]) AND e.estado = 'ACTIVA'
        AND p.country_code::text <> ALL($2::text[])
        AND NOT EXISTS (SELECT 1 FROM scheduling_holiday ph
                         WHERE ph.country_code = p.country_code AND ph.fecha = $3::date)`,
    [classroomIds, paises, fecha],
  );
  return f?.n ?? 0;
}

async function paisesConFeriado(fecha: string, paises: string[]): Promise<Map<string, string>> {
  const filas = await queryRows<{ pais: string; fuente: string }>(
    `SELECT country_code::text AS pais, fuente FROM scheduling_holiday
      WHERE fecha = $1::date AND country_code::text = ANY($2::text[])`,
    [fecha, paises],
  );
  return new Map(filas.map((f) => [f.pais, f.fuente]));
}

/** Qué pasaría al agregar o quitar un feriado, SIN escribir nada. */
export async function previoFeriadoPropio(input: {
  accion: "AGREGAR" | "QUITAR";
  fecha: string;
  paises: string[];
  countryScope: string[] | null;
}): Promise<PrevioFeriado> {
  await exigirFechaFutura(input.fecha);
  const paises = paisesValidos(input.paises, input.countryScope);
  const existentes = await paisesConFeriado(input.fecha, paises);

  let efectivos: string[];
  if (input.accion === "AGREGAR") {
    efectivos = paises.filter((p) => !existentes.has(p));
  } else {
    efectivos = paises.filter((p) => existentes.get(p) === FUENTE_FERIADO_PROPIO);
  }
  const salones: SalonImpactoFeriado[] = [];
  if (efectivos.length > 0) {
    const ajuste: AjusteFeriados =
      input.accion === "AGREGAR" ? { agregar: [input.fecha] } : { quitar: [input.fecha] };
    for (const c of await salonesCandidatos(efectivos, input.fecha)) {
      const r = await impactoDeSalon(c, ajuste);
      if (r !== null) salones.push(r.impacto);
    }
  }
  return {
    accion: input.accion,
    fecha: input.fecha,
    paises,
    paisesYaTienen: input.accion === "AGREGAR" ? paises.filter((p) => existentes.has(p)) : [],
    salones,
    ninosOtroPais:
      input.accion === "AGREGAR"
        ? await contarNinosOtroPais(
            salones.map((s) => s.id),
            efectivos,
            input.fecha,
          )
        : 0,
  };
}

// ── Escritura ─────────────────────────────────────────────────────────────

/**
 * Ajusta, dentro de la transacción, cada salón candidato cuyo calendario cambia.
 * Un salón con conflicto de contrato o con historia que se perdería NO se toca.
 */
async function ajustarSalonesTx(
  tx: PoolClient,
  candidatos: SalonCandidato[],
): Promise<Pick<ResultadoFeriado, "regenerados" | "pendientes">> {
  const regenerados: ResultadoFeriado["regenerados"] = [];
  const pendientes: ResultadoFeriado["pendientes"] = [];
  for (const c of candidatos) {
    const classroom = await findClassroomById(c.id, tx);
    if (classroom === null) continue;
    const plan = await planDeFuturas(tx, classroom, await getSlots(c.id, tx));
    if (!planCambia(plan)) continue;
    const conflictos = await conflictosDeContrato(c.id, plan.finDeseado);
    const bloqueo = motivoDeBloqueo(plan);
    if (bloqueo !== null || conflictos.length > 0) {
      pendientes.push({
        id: c.id,
        nombre: c.nombre,
        motivo:
          bloqueo ??
          `La última sesión (${plan.finDeseado ?? "—"}) pasaría del final del contrato de ${String(conflictos.length)} niño(s).`,
        conflictos,
      });
      continue;
    }
    await aplicarPlanFuturasTx(tx, classroom, plan);
    regenerados.push({ id: c.id, nombre: c.nombre });
  }
  return { regenerados, pendientes };
}

/** Crea el feriado propio (una fecha, uno o varios países) y ajusta los salones afectados. */
export async function crearFeriadoPropio(input: {
  actorUserId: string;
  countryScope: string[] | null;
  fecha: string;
  nombre: string;
  paises: string[];
  ip?: string | null;
}): Promise<ResultadoFeriado> {
  await exigirFechaFutura(input.fecha);
  const nombre = input.nombre.trim();
  if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
    throw new ValidationError(
      `El nombre es obligatorio (de ${String(NOMBRE_MIN)} a ${String(NOMBRE_MAX)} caracteres).`,
    );
  }
  const paises = paisesValidos(input.paises, input.countryScope);
  const existentes = await paisesConFeriado(input.fecha, paises);
  const nuevos = paises.filter((p) => !existentes.has(p));
  if (nuevos.length === 0) {
    throw new ConflictError(`Esa fecha ya es feriado en ${paises.join(", ")}.`);
  }

  const resultado = await withTransaction(async (tx) => {
    for (const pais of nuevos) {
      await execute(
        `INSERT INTO scheduling_holiday (country_code, fecha, nombre, fuente)
         VALUES ($1, $2::date, $3, $4)`,
        [pais, input.fecha, nombre, FUENTE_FERIADO_PROPIO],
        tx,
      );
    }
    return ajustarSalonesTx(tx, await salonesCandidatos(nuevos, input.fecha));
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.feriado_propio_creado",
    entidad: "scheduling_holiday",
    entidadId: input.fecha,
    payload: {
      fecha: input.fecha,
      nombre,
      paises: nuevos,
      regenerados: resultado.regenerados.map((s) => s.nombre),
      pendientes: resultado.pendientes.map((s) => s.nombre),
    },
    ip: input.ip ?? null,
  });
  return { fecha: input.fecha, paises: nuevos, ...resultado };
}

/** Quita un feriado propio futuro (solo los de fuente MANUAL) y ajusta los salones afectados. */
export async function quitarFeriadoPropio(input: {
  actorUserId: string;
  countryScope: string[] | null;
  fecha: string;
  paises: string[];
  ip?: string | null;
}): Promise<ResultadoFeriado> {
  await exigirFechaFutura(input.fecha);
  const paises = paisesValidos(input.paises, input.countryScope);
  const existentes = await paisesConFeriado(input.fecha, paises);
  const ajenos = paises.filter((p) => existentes.get(p) !== FUENTE_FERIADO_PROPIO);
  if (ajenos.length > 0) {
    throw new ConflictError(
      `Solo se quitan feriados propios: en ${ajenos.join(", ")} ese día no hay uno propio.`,
    );
  }

  const resultado = await withTransaction(async (tx) => {
    await execute(
      `DELETE FROM scheduling_holiday
        WHERE fecha = $1::date AND fuente = $2 AND country_code::text = ANY($3::text[])`,
      [input.fecha, FUENTE_FERIADO_PROPIO, paises],
      tx,
    );
    return ajustarSalonesTx(tx, await salonesCandidatos(paises, input.fecha));
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.feriado_propio_quitado",
    entidad: "scheduling_holiday",
    entidadId: input.fecha,
    payload: {
      fecha: input.fecha,
      paises,
      regenerados: resultado.regenerados.map((s) => s.nombre),
      pendientes: resultado.pendientes.map((s) => s.nombre),
    },
    ip: input.ip ?? null,
  });
  return { fecha: input.fecha, paises, ...resultado };
}

// ── Pendientes (derivados) ────────────────────────────────────────────────

export interface SalonPendiente extends SalonImpactoFeriado {
  motivo: string;
}

/**
 * Salones cuyo calendario NO es el que les toca (un feriado que no se les aplicó por
 * un conflicto de contrato o por historia). Se deriva: no hay tabla de pendientes.
 */
export async function salonesPendientesDeFeriados(
  countryScope: string[] | null,
): Promise<SalonPendiente[]> {
  const paises = countryScope ?? [...PAISES_FERIADO];
  const salida: SalonPendiente[] = [];
  for (const c of await salonesCandidatos(paises)) {
    const r = await impactoDeSalon(c, undefined);
    if (r === null) continue;
    salida.push({
      ...r.impacto,
      motivo:
        r.impacto.bloqueo ??
        (r.impacto.conflictos.length > 0
          ? `La última sesión (${r.impacto.finNuevo ?? "—"}) pasaría del final del contrato de ${String(r.impacto.conflictos.length)} niño(s).`
          : "El calendario del salón no incluye un feriado reciente."),
    });
  }
  return salida;
}

/** El botón "Regenerar" de un salón pendiente: vuelve a comprobar y aplica solo si ya no hay conflicto. */
export async function regenerarSalonPendiente(input: {
  actorUserId: string;
  countryScope: string[] | null;
  classroomId: string;
  ip?: string | null;
}): Promise<{ id: string; nombre: string }> {
  const classroom = await findClassroomById(input.classroomId);
  if (classroom === null) throw new NotFoundError("El salón no existe.");
  if (input.countryScope !== null && !input.countryScope.includes(classroom.holidayCountry)) {
    throw new ForbiddenError("Tu rol no gestiona el país de ese salón.");
  }
  await withTransaction(async (tx) => {
    const salon = await findClassroomById(input.classroomId, tx);
    if (salon === null) throw new NotFoundError("El salón no existe.");
    const plan = await planDeFuturas(tx, salon, await getSlots(salon.id, tx));
    if (!planCambia(plan)) throw new ConflictError("El calendario del salón ya está al día.");
    const conflictos = await conflictosDeContrato(salon.id, plan.finDeseado);
    if (conflictos.length > 0) {
      throw new ConflictError(
        `La última sesión (${plan.finDeseado ?? "—"}) pasaría del final del contrato de ${String(conflictos.length)} niño(s): ${conflictos
          .slice(0, 5)
          .map((c) => c.nombre)
          .join(", ")}. Amplía sus contratos y vuelve a intentarlo.`,
      );
    }
    await aplicarPlanFuturasTx(tx, salon, plan);
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.salon_calendario_ajustado",
    entidad: "scheduling_classroom",
    entidadId: classroom.id,
    payload: { nombre: classroom.nombre },
    ip: input.ip ?? null,
  });
  return { id: classroom.id, nombre: classroom.nombre };
}
