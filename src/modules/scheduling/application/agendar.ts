import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import {
  ETIQUETA_TIPO_AGENDA,
  estaLleno,
  seSolapan,
  tramo,
  type TipoAgenda,
  type Tramo,
} from "../domain/agenda";
import { JOIN_NOMBRE_GUIA, NOMBRE_GUIA } from "../infrastructure/scheduling-repository";
import { SQL_SESION_CANCELADA } from "./cancelacion";
import { reservarWelcomeTx, welcomesDisponibles } from "./welcome";

/**
 * AGENDAR desde la ficha del niño (Academic management, 2026-10-16).
 *
 * La lista de una clase sigue saliendo de las matrículas del salón (regla de
 * cohortes); agendar SUMA a un niño de otro salón a UNA sesión concreta:
 *  - una sesión extra, un club o un taller ABIERTO cuyo alcance (campaña, curso
 *    y salón, NULL = "Todos") coincide con el del niño;
 *  - una CLASE REGULAR de otro salón de su MISMA campaña y curso (recuperación);
 *  - un WELCOME, con la reserva de siempre (`reservarWelcomeTx`).
 * Lo de su propio salón ya lo tiene: se muestra como "en su lista".
 *
 * La reserva se ata a (salón, instante), no al id de la sesión: la regeneración
 * del horario recrea las sesiones con ids nuevos.
 */

type Queryable = Pick<PoolClient, "query">;

/** El niño y su salón: de aquí sale todo lo que le corresponde. */
export interface ContextoNino {
  childPersonId: string;
  /** Salón de su matrícula ACTIVA. */
  classroomId: string;
  /** Su nivel actual (lo pide el Welcome). */
  nivel: string;
}

interface SalonNino {
  classroomId: string;
  campaignId: string;
  curso: string;
  timezone: string;
}

export interface OpcionAgenda {
  tipo: TipoAgenda;
  /** La sesión (o el Welcome) que se agenda. */
  id: string;
  startsAt: string;
  duracionMin: number;
  /** Salón donde se dicta (varios si es compartido); "—" en el Welcome. */
  salon: string;
  campania: string | null;
  guia: string | null;
  limite: number;
  ocupados: number;
  lleno: boolean;
  /** Ya está en esa lista: su salón, o ya agendado. */
  enSuLista: boolean;
  /** Qué tiene ya a esa hora, si choca. */
  choque: string | null;
  /** Zona del salón (para la hora de pared). */
  timezone: string | null;
}

async function salonDelNino(classroomId: string, q?: Queryable): Promise<SalonNino> {
  const s = await queryOne<SalonNino>(
    `SELECT cl.id AS "classroomId", cu.campaign_id AS "campaignId", cu.tipo::text AS curso,
            cl.timezone
       FROM scheduling_classroom cl JOIN catalog_course cu ON cu.id = cl.course_id
      WHERE cl.id = $1`,
    [classroomId],
    q,
  );
  if (s === null) throw new NotFoundError("El salón del niño no existe.");
  return s;
}

/** Ocupados de una sesión: los matriculados del salón (como el cupo) + los agendados. */
const SQL_OCUPADOS = `(
  (SELECT count(*) FROM enrollment_enrollment e
    WHERE e.classroom_id = s.classroom_id AND e.estado IN ('ACTIVA', 'RESERVADA'))
  + (SELECT count(*) FROM scheduling_agendado a
      WHERE a.classroom_id = s.classroom_id AND a.starts_at = s.starts_at AND a.estado = 'ACTIVA')
)::int`;

interface FilaSesion {
  id: string;
  tipo: string;
  startsAt: string;
  duracionMin: number;
  classroomId: string;
  grupoId: string | null;
  salon: string;
  timezone: string;
  campania: string;
  guia: string | null;
  limite: number;
  ocupados: number;
  /** Ya agendado ahí. */
  agendado: boolean;
}

/**
 * Las sesiones que le CORRESPONDEN al niño, del tipo pedido. UNA consulta para la
 * lista y para la reserva: si se calcularan aparte, la lista ofrecería algo que
 * agendar después rechaza. Con `sessionId`, solo esa (y sin filtro de fecha).
 */
async function sesionesElegibles(
  q: Queryable | undefined,
  input: {
    salon: SalonNino;
    childPersonId: string;
    tipo: Exclude<TipoAgenda, "WELCOME">;
    fecha?: string;
    sessionId?: string;
  },
): Promise<FilaSesion[]> {
  const v: unknown[] = [
    input.salon.classroomId,
    input.salon.campaignId,
    input.salon.curso,
    input.childPersonId,
  ];
  const conds: string[] = [`s.starts_at > now()`, `NOT ${SQL_SESION_CANCELADA("s")}`, `cl.activo`];
  if (input.tipo === "REGULAR") {
    // Clase del horario de cualquier salón de SU campaña y SU curso.
    conds.push(`s.slot_id IS NOT NULL`, `s.tipo = 'SESION'`);
    conds.push(`cu.campaign_id = $2`, `cu.tipo::text = $3`);
  } else {
    v.push(input.tipo);
    conds.push(`s.slot_id IS NULL`, `s.tipo::text = $${String(v.length)}`);
    // Su propio salón, o abierto con un alcance que le coincide (NULL = Todos).
    conds.push(`(s.classroom_id = $1 OR (s.abierto
       AND (s.alcance_campaign_id IS NULL OR s.alcance_campaign_id = $2)
       AND (s.alcance_curso IS NULL OR s.alcance_curso = $3)
       AND (s.alcance_classroom_id IS NULL OR s.alcance_classroom_id = $1)))`);
  }
  if (input.sessionId !== undefined) {
    v.push(input.sessionId);
    conds.push(`s.id = $${String(v.length)}`);
  } else if (input.fecha !== undefined) {
    // El día en el reloj del salón del NIÑO: es el que mira quien agenda.
    v.push(input.fecha, input.salon.timezone);
    conds.push(
      `(s.starts_at AT TIME ZONE $${String(v.length)})::date = $${String(v.length - 1)}::date`,
    );
  }
  return queryRows<FilaSesion>(
    // `$1::uuid` aparece siempre aquí: en las clases regulares el salón del niño
    // no filtra, y sin uso postgres no sabría su tipo.
    `SELECT s.id, s.tipo::text AS tipo, s.starts_at AS "startsAt", s.duracion_min AS "duracionMin",
            (s.classroom_id = $1::uuid) AS propia,
            s.classroom_id AS "classroomId", s.grupo_id AS "grupoId", cl.nombre AS salon,
            cl.timezone, ca.nombre AS campania, ${NOMBRE_GUIA} AS guia,
            ${input.tipo === "REGULAR" ? "cl.cupo" : "COALESCE(s.limite_usuarios, cl.cupo)"} AS limite,
            ${SQL_OCUPADOS} AS ocupados,
            EXISTS (SELECT 1 FROM scheduling_agendado a
                     WHERE a.classroom_id = s.classroom_id AND a.starts_at = s.starts_at
                       AND a.child_person_id = $4 AND a.estado = 'ACTIVA') AS agendado
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN identity_user gu ON gu.id = COALESCE(s.guia_user_id, cl.guia_user_id)
       ${JOIN_NOMBRE_GUIA}
      WHERE ${conds.join(" AND ")}
      ORDER BY s.starts_at, cl.nombre`,
    v,
    q,
  );
}

/**
 * Agrupa las filas de un evento COMPARTIDO (una por salón, mismo `grupo_id`) en
 * una sola opción: es UNA clase. La fila representante es la del salón del niño
 * si está, si no la primera; cupo y ocupados suman los de todos sus salones.
 */
function agrupar(
  filas: FilaSesion[],
  tipo: Exclude<TipoAgenda, "WELCOME">,
  salonNino: string,
): (OpcionAgenda & { tramo: Tramo })[] {
  const grupos = new Map<string, FilaSesion[]>();
  for (const f of filas) {
    const clave = f.grupoId ?? f.id;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  return [...grupos.values()].map((g) => {
    const propia = g.find((f) => f.classroomId === salonNino);
    const rep = propia ?? g[0]!;
    const limite = g.reduce((n, f) => n + f.limite, 0);
    const ocupados = g.reduce((n, f) => n + f.ocupados, 0);
    return {
      tipo,
      id: rep.id,
      startsAt: new Date(rep.startsAt).toISOString(),
      duracionMin: rep.duracionMin,
      salon: g.map((f) => f.salon).join(" · "),
      campania: rep.campania,
      guia: rep.guia,
      limite,
      ocupados,
      lleno: estaLleno(limite, ocupados),
      enSuLista: propia !== undefined || g.some((f) => f.agendado),
      choque: null,
      timezone: rep.timezone,
      tramo: tramo(rep.startsAt, rep.duracionMin),
    };
  });
}

/** Lo que el niño YA tiene en una ventana: sus clases, lo agendado y su Welcome. */
async function compromisos(
  q: Queryable | undefined,
  salon: SalonNino,
  childPersonId: string,
  desde: Date,
  hasta: Date,
): Promise<{ clave: string; etiqueta: string; tramo: Tramo }[]> {
  const filas = await queryRows<{
    clave: string;
    etiqueta: string;
    startsAt: string;
    duracionMin: number;
  }>(
    `SELECT s.id AS clave, s.tipo::text || ' de su salón (' || cl.nombre || ')' AS etiqueta,
            s.starts_at AS "startsAt", s.duracion_min AS "duracionMin"
       FROM scheduling_session s JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE s.classroom_id = $1 AND s.starts_at BETWEEN $3 AND $4
        AND NOT ${SQL_SESION_CANCELADA("s")}
     UNION ALL
     SELECT s.id, 'lo agendado en ' || cl.nombre, s.starts_at, s.duracion_min
       FROM scheduling_agendado a
       JOIN scheduling_session s ON s.classroom_id = a.classroom_id AND s.starts_at = a.starts_at
       JOIN scheduling_classroom cl ON cl.id = a.classroom_id
      WHERE a.child_person_id = $2 AND a.estado = 'ACTIVA' AND a.starts_at BETWEEN $3 AND $4
     UNION ALL
     SELECT w.id, 'su Welcome', w.starts_at, w.duracion_min
       FROM scheduling_welcome_reserva r JOIN scheduling_welcome w ON w.id = r.welcome_id
      WHERE r.child_person_id = $2 AND r.estado = 'ACTIVA' AND w.starts_at BETWEEN $3 AND $4`,
    [salon.classroomId, childPersonId, desde, hasta],
    q,
  );
  return filas.map((f) => ({
    clave: f.clave,
    etiqueta: f.etiqueta
      .replace(/^SESION /, "Sesión ")
      .replace(/^CLUB /, "Club ")
      .replace(/^TALLER /, "Taller "),
    tramo: tramo(f.startsAt, f.duracionMin),
  }));
}

/** Marca en cada opción lo que ya tiene el niño a esa hora (salvo la propia). */
function marcarChoques<
  T extends { id: string; enSuLista: boolean; tramo: Tramo; choque: string | null },
>(opciones: T[], tiene: { clave: string; etiqueta: string; tramo: Tramo }[]): T[] {
  return opciones.map((o) => {
    if (o.enSuLista) return o;
    const c = tiene.find((t) => t.clave !== o.id && seSolapan(t.tramo, o.tramo));
    return c === undefined ? o : { ...o, choque: c.etiqueta };
  });
}

const DIA_MS = 24 * 60 * 60_000;

/**
 * Lo que se le puede agendar al niño ese DÍA (en el reloj de su salón), del tipo
 * pedido: los llenos y los que chocan TAMBIÉN vienen, marcados, para que quien
 * agenda vea por qué no.
 */
export async function opcionesAgenda(input: {
  nino: ContextoNino;
  tipo: TipoAgenda;
  fecha: string;
}): Promise<OpcionAgenda[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    throw new ValidationError("La fecha debe ser YYYY-MM-DD.");
  }
  const salon = await salonDelNino(input.nino.classroomId);
  let opciones: (OpcionAgenda & { tramo: Tramo })[];
  if (input.tipo === "WELCOME") {
    const actual = await queryOne<{ welcomeId: string }>(
      `SELECT welcome_id AS "welcomeId" FROM scheduling_welcome_reserva
        WHERE child_person_id = $1 AND estado = 'ACTIVA'`,
      [input.nino.childPersonId],
    );
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: salon.timezone });
    opciones = (
      await welcomesDisponibles({ classroomId: salon.classroomId, nivel: input.nino.nivel })
    )
      .filter((w) => dia.format(new Date(w.startsAt)) === input.fecha)
      .map((w) => ({
        tipo: "WELCOME" as const,
        id: w.id,
        startsAt: new Date(w.startsAt).toISOString(),
        duracionMin: w.duracionMin,
        salon: "—",
        campania: w.campania,
        guia: w.guia,
        limite: w.limiteUsuarios,
        ocupados: w.inscritos,
        lleno: estaLleno(w.limiteUsuarios, w.inscritos),
        enSuLista: actual?.welcomeId === w.id,
        choque: null,
        timezone: null,
        tramo: tramo(w.startsAt, w.duracionMin),
      }));
  } else {
    const filas = await sesionesElegibles(undefined, {
      salon,
      childPersonId: input.nino.childPersonId,
      tipo: input.tipo,
      fecha: input.fecha,
    });
    opciones = agrupar(filas, input.tipo, salon.classroomId);
  }
  if (opciones.length === 0) return [];
  const desde = new Date(Math.min(...opciones.map((o) => o.tramo.inicio)) - DIA_MS);
  const hasta = new Date(Math.max(...opciones.map((o) => o.tramo.fin)) + DIA_MS);
  const tiene = await compromisos(undefined, salon, input.nino.childPersonId, desde, hasta);
  // El tramo es de uso interno (choques): no viaja a la pantalla.
  return marcarChoques(opciones, tiene).map((o) => {
    const { tramo: interno, ...visible } = o;
    void interno;
    return visible;
  });
}

export interface Agendado {
  id: string;
  tipo: TipoAgenda;
  startsAt: string;
  salon: string;
  /** La sesión sigue existiendo a esa hora (una suspensión la puede quitar). */
  vigente: boolean;
}

/**
 * AGENDA al niño. En UNA transacción: bloquea la sesión (o el Welcome), vuelve
 * a comprobar con la MISMA regla de la lista que le corresponde, que no choque
 * con lo que ya tiene y el cupo. Lleno → 409 con `details.tipo = "sobrecupo"`;
 * con `autorizarSobrecupo` lo agenda igual, pero solo si quien lo pide tiene el
 * permiso (lo resuelve la ruta en `puedeSobrecupo`, desde la SESIÓN, nunca del
 * cuerpo de la petición).
 */
export async function agendarNino(input: {
  actorUserId: string;
  nino: ContextoNino;
  tipo: TipoAgenda;
  /** La sesión, o el Welcome. */
  id: string;
  autorizarSobrecupo: boolean;
  puedeSobrecupo: boolean;
  ip?: string | null;
}): Promise<{ startsAt: string; sobrecupo: boolean }> {
  if (input.autorizarSobrecupo && !input.puedeSobrecupo) {
    throw new ForbiddenError("No tienes permiso para autorizar un sobrecupo.");
  }
  const salon = await salonDelNino(input.nino.classroomId);
  const sobrecupoPor = input.autorizarSobrecupo ? input.actorUserId : null;

  const resultado = await withTransaction(async (tx) => {
    if (input.tipo === "WELCOME") {
      const w = await queryOne<{ startsAt: string; duracionMin: number }>(
        `SELECT starts_at AS "startsAt", duracion_min AS "duracionMin"
           FROM scheduling_welcome WHERE id = $1`,
        [input.id],
        tx,
      );
      if (w === null) throw new NotFoundError("Ese Welcome ya no existe.");
      const t = tramo(w.startsAt, w.duracionMin);
      // El Welcome que ya tiene NO cuenta como choque: agendar otro lo reemplaza.
      const choque = (
        await compromisos(
          tx,
          salon,
          input.nino.childPersonId,
          new Date(t.inicio - DIA_MS),
          new Date(t.fin + DIA_MS),
        )
      ).find((c) => c.etiqueta !== "su Welcome" && seSolapan(c.tramo, t));
      if (choque !== undefined) {
        throw new ConflictError(`A esa hora el niño ya tiene ${choque.etiqueta}.`);
      }
      const r = await reservarWelcomeTx(tx, {
        welcomeId: input.id,
        childPersonId: input.nino.childPersonId,
        classroomId: input.nino.classroomId,
        nivel: input.nino.nivel,
        agendadoPor: input.actorUserId,
        sobrecupoAutorizadoPor: sobrecupoPor,
      });
      const lleno = await queryOne<{ sobre: boolean }>(
        `SELECT sobrecupo_autorizado_por IS NOT NULL AS sobre
           FROM scheduling_welcome_reserva WHERE id = $1`,
        [r.reservaId],
        tx,
      );
      return { startsAt: new Date(r.startsAt).toISOString(), sobrecupo: lleno?.sobre === true };
    }

    // Bloquea la sesión y, si es compartida, sus hermanas: dos agendamientos a
    // la vez no se llevan el último cupo.
    const base = await queryOne<{ grupoId: string | null }>(
      `SELECT grupo_id AS "grupoId" FROM scheduling_session WHERE id = $1 FOR UPDATE`,
      [input.id],
      tx,
    );
    if (base === null) throw new NotFoundError("Esa sesión ya no existe.");
    if (base.grupoId !== null) {
      await queryRows(
        `SELECT id FROM scheduling_session WHERE grupo_id = $1 FOR UPDATE`,
        [base.grupoId],
        tx,
      );
    }

    const filas =
      base.grupoId === null
        ? await sesionesElegibles(tx, {
            salon,
            childPersonId: input.nino.childPersonId,
            tipo: input.tipo,
            sessionId: input.id,
          })
        : (
            await Promise.all(
              (
                await queryRows<{ id: string }>(
                  `SELECT id FROM scheduling_session WHERE grupo_id = $1`,
                  [base.grupoId],
                  tx,
                )
              ).map((h) =>
                sesionesElegibles(tx, {
                  salon,
                  childPersonId: input.nino.childPersonId,
                  tipo: input.tipo as Exclude<TipoAgenda, "WELCOME">,
                  sessionId: h.id,
                }),
              ),
            )
          ).flat();
    const [opcion] = agrupar(filas, input.tipo, salon.classroomId);
    if (opcion === undefined) {
      throw new ConflictError(
        `Ese ${ETIQUETA_TIPO_AGENDA[input.tipo].toLowerCase()} no está disponible para este niño.`,
      );
    }
    if (opcion.enSuLista) {
      throw new ConflictError("El niño ya está en la lista de esa sesión.");
    }
    const choque = (
      await compromisos(
        tx,
        salon,
        input.nino.childPersonId,
        new Date(opcion.tramo.inicio - DIA_MS),
        new Date(opcion.tramo.fin + DIA_MS),
      )
    ).find((c) => seSolapan(c.tramo, opcion.tramo));
    if (choque !== undefined) {
      throw new ConflictError(`A esa hora el niño ya tiene ${choque.etiqueta}.`);
    }
    if (opcion.lleno && sobrecupoPor === null) {
      throw new ConflictError("Esa sesión está llena.", {
        details: { tipo: "sobrecupo", limite: opcion.limite, ocupados: opcion.ocupados },
      });
    }
    // El niño queda en la sesión representante (la del grupo que se eligió).
    const rep = filas.find((f) => f.id === opcion.id)!;
    await execute(
      `INSERT INTO scheduling_agendado
         (id, classroom_id, starts_at, child_person_id, tipo, agendado_por, sobrecupo_autorizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newId(),
        rep.classroomId,
        rep.startsAt,
        input.nino.childPersonId,
        input.tipo,
        input.actorUserId,
        opcion.lleno ? sobrecupoPor : null,
      ],
      tx,
    );
    return { startsAt: opcion.startsAt, sobrecupo: opcion.lleno };
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.nino_agendado",
    entidad: "people_person",
    entidadId: input.nino.childPersonId,
    payload: {
      tipo: input.tipo,
      id: input.id,
      startsAt: resultado.startsAt,
      sobrecupo: resultado.sobrecupo,
    },
    ip: input.ip ?? null,
  });
  return resultado;
}

/** Lo que se le agendó al niño fuera de su salón y todavía no ocurre. */
export async function agendadosDeNino(childPersonId: string): Promise<Agendado[]> {
  const filas = await queryRows<{
    id: string;
    tipo: TipoAgenda;
    startsAt: string;
    salon: string;
    vigente: boolean;
  }>(
    `SELECT a.id, a.tipo, a.starts_at AS "startsAt", cl.nombre AS salon,
            EXISTS (SELECT 1 FROM scheduling_session s
                     WHERE s.classroom_id = a.classroom_id AND s.starts_at = a.starts_at) AS vigente
       FROM scheduling_agendado a JOIN scheduling_classroom cl ON cl.id = a.classroom_id
      WHERE a.child_person_id = $1 AND a.estado = 'ACTIVA' AND a.starts_at > now() - interval '1 day'
      ORDER BY a.starts_at`,
    [childPersonId],
  );
  return filas.map((f) => ({ ...f, startsAt: new Date(f.startsAt).toISOString() }));
}

/** Cancela algo agendado (no se borra: queda quién y cuándo). */
export async function cancelarAgendado(input: {
  actorUserId: string;
  childPersonId: string;
  agendadoId: string;
  ip?: string | null;
}): Promise<void> {
  const n = await execute(
    `UPDATE scheduling_agendado
        SET estado = 'CANCELADA', cancelado_por = $3, cancelado_en = now()
      WHERE id = $1 AND child_person_id = $2 AND estado = 'ACTIVA'`,
    [input.agendadoId, input.childPersonId, input.actorUserId],
  );
  if (n === 0) throw new NotFoundError("No hay nada agendado con ese id.");
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.agendado_cancelado",
    entidad: "people_person",
    entidadId: input.childPersonId,
    payload: { agendadoId: input.agendadoId },
    ip: input.ip ?? null,
  });
}
