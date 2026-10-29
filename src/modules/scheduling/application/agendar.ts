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
import {
  JOIN_NOMBRE_GUIA,
  NOMBRE_GUIA,
  SQL_EN_LISTA,
} from "../infrastructure/scheduling-repository";
import { SQL_SESION_CANCELADA } from "./cancelacion";
import { reservarWelcomeTx, welcomesDisponibles } from "./welcome";

/**
 * AGENDAR desde la ficha del niño (Academic management, 2026-10-16).
 *
 * La lista de una clase sigue saliendo de las matrículas del salón (regla de
 * cohortes); agendar SUMA a un niño de otro salón a UNA sesión concreta:
 *  - una sesión extra, un club o un taller ABIERTO cuyo alcance (campaña, curso,
 *    país y salón, NULL = "Todos") y cuyo NIVEL coinciden con los del niño;
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
  /** País del salón (su calendario de feriados). */
  pais: string;
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
  /** Es de SU salón (no se cancela: la lista sale de su matrícula). */
  propia: boolean;
  /** Lo agendado ahí, si lo está (es lo que se cancela). */
  agendadoId: string | null;
  /** Qué tiene ya a esa hora, si choca. */
  choque: string | null;
  /** Zona del salón (para la hora de pared). */
  timezone: string | null;
  /** Nivel del evento (null = todos) y su descripción. */
  nivel: string | null;
  observaciones: string | null;
}

async function salonDelNino(classroomId: string, q?: Queryable): Promise<SalonNino> {
  const s = await queryOne<SalonNino>(
    `SELECT cl.id AS "classroomId", cu.campaign_id AS "campaignId", cu.tipo::text AS curso,
            cl.timezone, cl.holiday_country::text AS pais
       FROM scheduling_classroom cl JOIN catalog_course cu ON cu.id = cl.course_id
      WHERE cl.id = $1`,
    [classroomId],
    q,
  );
  if (s === null) throw new NotFoundError("El salón del niño no existe.");
  return s;
}

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
  /** Lo agendado ahí para este niño, si lo está. */
  agendadoId: string | null;
  nivel: string | null;
  observaciones: string | null;
  tandaId: string | null;
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
    /** Su nivel: el evento abierto de un nivel solo es para ese nivel. */
    nivel: string;
    tipo: Exclude<TipoAgenda, "WELCOME">;
    fecha?: string;
    /** La SEMANA en curso (lunes a domingo en el reloj de su salón). */
    semana?: boolean;
    sessionId?: string;
  },
): Promise<FilaSesion[]> {
  const v: unknown[] = [
    input.salon.classroomId,
    input.salon.campaignId,
    input.salon.curso,
    input.childPersonId,
    input.salon.pais,
    input.nivel,
  ];
  const conds: string[] = [`s.starts_at > now()`, `NOT ${SQL_SESION_CANCELADA("s")}`, `cl.activo`];
  if (input.tipo === "REGULAR") {
    // Clase del horario de cualquier salón de SU campaña y SU curso.
    conds.push(`s.slot_id IS NOT NULL`, `s.tipo = 'SESION'`);
    conds.push(`cu.campaign_id = $2`, `cu.tipo::text = $3`);
  } else {
    v.push(input.tipo);
    conds.push(`s.slot_id IS NULL`, `s.tipo::text = $${String(v.length)}`);
    // Su propio salón (un CLUB, además, de su nivel o de todos), o abierto con un
    // alcance que le coincide (NULL = Todos).
    conds.push(`((s.classroom_id = $1 AND (s.tipo <> 'CLUB' OR s.nivel IS NULL OR s.nivel = $6))
       OR (s.abierto
       AND (s.alcance_campaign_id IS NULL OR s.alcance_campaign_id = $2)
       AND (s.alcance_curso IS NULL OR s.alcance_curso = $3)
       AND (s.alcance_pais IS NULL OR s.alcance_pais = $5)
       AND (s.alcance_classroom_id IS NULL OR s.alcance_classroom_id = $1)
       AND (s.nivel IS NULL OR s.nivel = $6)))`);
  }
  if (input.sessionId !== undefined) {
    v.push(input.sessionId);
    conds.push(`s.id = $${String(v.length)}`);
  } else if (input.semana === true) {
    v.push(input.salon.timezone);
    const tz = `$${String(v.length)}`;
    conds.push(
      `s.starts_at < ((date_trunc('week', now() AT TIME ZONE ${tz}) + interval '7 days') AT TIME ZONE ${tz})`,
    );
  } else if (input.fecha !== undefined) {
    // El día en el reloj del salón del NIÑO: es el que mira quien agenda.
    v.push(input.fecha, input.salon.timezone);
    conds.push(
      `(s.starts_at AT TIME ZONE $${String(v.length)})::date = $${String(v.length - 1)}::date`,
    );
  }
  return queryRows<FilaSesion>(
    // `$1::uuid`, `$5` y `$6` aparecen siempre aquí: en las clases regulares el
    // salón, el país y el nivel del niño no filtran, y sin uso postgres no
    // sabría su tipo.
    `SELECT s.id, s.tipo::text AS tipo, s.starts_at AS "startsAt", s.duracion_min AS "duracionMin",
            (s.classroom_id = $1::uuid) AS propia,
            s.classroom_id AS "classroomId", s.grupo_id AS "grupoId", cl.nombre AS salon,
            cl.timezone, ca.nombre AS campania, ${NOMBRE_GUIA} AS guia,
            ${input.tipo === "REGULAR" ? "cl.cupo" : "COALESCE(s.limite_usuarios, cl.cupo)"} AS limite,
            ${SQL_EN_LISTA("s")} AS ocupados, s.nivel, s.observaciones, s.tanda_id AS "tandaId",
            (SELECT a.id FROM scheduling_agendado a
              WHERE a.classroom_id = s.classroom_id AND a.starts_at = s.starts_at
                AND a.child_person_id = $4 AND a.estado = 'ACTIVA' LIMIT 1) AS "agendadoId",
            $5::text AS "_pais", $6::text AS "_nivel"
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

/** Un evento COMPARTIDO (una fila por salón, mismo `grupo_id`) es UNA clase. */
function porGrupo<T extends { id: string; grupoId: string | null }>(filas: T[]): T[][] {
  const grupos = new Map<string, T[]>();
  for (const f of filas) {
    const clave = f.grupoId ?? f.id;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  return [...grupos.values()];
}

/**
 * Cupo de UNA clase compartida. Una sesión suelta o un taller suma el de sus
 * salones (cada salón trae a los suyos); un CLUB es de inscritos y su "Límite
 * de usuarios" es el del club entero, repetido en cada salón: se toma una vez.
 */
function cupoDeGrupo(tipo: string, g: { limite: number; ocupados: number }[]) {
  const ocupados = g.reduce((n, f) => n + f.ocupados, 0);
  const limite =
    tipo === "CLUB" ? Math.max(...g.map((f) => f.limite)) : g.reduce((n, f) => n + f.limite, 0);
  return { limite, ocupados };
}

/**
 * Agrupa las filas de un evento COMPARTIDO en una sola opción. La fila
 * representante es la del salón del niño si está, si no la primera.
 */
function agrupar(
  filas: FilaSesion[],
  tipo: Exclude<TipoAgenda, "WELCOME">,
  salonNino: string,
): (OpcionAgenda & { tramo: Tramo })[] {
  return porGrupo(filas).map((g) => {
    const propia = g.find((f) => f.classroomId === salonNino);
    const rep = propia ?? g[0]!;
    const { limite, ocupados } = cupoDeGrupo(tipo, g);
    const agendadoId = g.find((f) => f.agendadoId !== null)?.agendadoId ?? null;
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
      // Un CLUB es de inscritos: dictarse en su salón no lo pone en la lista.
      enSuLista: (tipo !== "CLUB" && propia !== undefined) || agendadoId !== null,
      propia: propia !== undefined,
      agendadoId,
      choque: null,
      timezone: rep.timezone,
      nivel: rep.nivel,
      observaciones: rep.observaciones,
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
        -- Un club de su salón no lo compromete si no se inscribió (ese va abajo).
        AND s.tipo <> 'CLUB'
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
        propia: false,
        agendadoId: null,
        choque: null,
        timezone: null,
        nivel: w.nivel,
        observaciones: w.observaciones,
        tramo: tramo(w.startsAt, w.duracionMin),
      }));
  } else {
    const filas = await sesionesElegibles(undefined, {
      salon,
      childPersonId: input.nino.childPersonId,
      nivel: input.nino.nivel,
      tipo: input.tipo,
      fecha: input.fecha,
    });
    opciones = agrupar(filas, input.tipo, salon.classroomId);
  }
  return conChoques(opciones, salon, input.nino.childPersonId);
}

/** Marca los choques con lo que ya tiene y quita el tramo (es de uso interno). */
async function conChoques(
  opciones: (OpcionAgenda & { tramo: Tramo })[],
  salon: SalonNino,
  childPersonId: string,
): Promise<OpcionAgenda[]> {
  if (opciones.length === 0) return [];
  const desde = new Date(Math.min(...opciones.map((o) => o.tramo.inicio)) - DIA_MS);
  const hasta = new Date(Math.max(...opciones.map((o) => o.tramo.fin)) + DIA_MS);
  const tiene = await compromisos(undefined, salon, childPersonId, desde, hasta);
  return marcarChoques(opciones, tiene).map((o) => {
    const { tramo: interno, ...visible } = o;
    void interno;
    return visible;
  });
}

/** Un club de la semana, con lo que dura y cómo le fue al niño con él. */
export interface ClubSemana extends OpcionAgenda {
  /** Si es de una tanda: hasta cuándo va y cuántas sesiones le quedan. */
  tanda: { fin: string; restantes: number } | null;
  /** Su última inscripción en este club terminó RETIRADA por faltas. */
  retiradoPorFaltas: boolean;
}

/**
 * Inscripción Clubes del panel del ALUMNO: los clubes de la SEMANA EN CURSO
 * (lunes a domingo en el reloj de su salón, de ahora en adelante) que le
 * corresponden — los que se dictan en su salón (por la campaña, país, curso y
 * salón con que se crearon) y son de su nivel o de todos, y los ABIERTOS a
 * otros salones cuyo alcance coincide—. La MISMA regla de Academic management ›
 * Agendar (`sesionesElegibles`), así que la lista no ofrece algo que inscribir
 * rechace.
 */
export async function clubesDeLaSemana(nino: ContextoNino): Promise<ClubSemana[]> {
  const salon = await salonDelNino(nino.classroomId);
  const filas = await sesionesElegibles(undefined, {
    salon,
    childPersonId: nino.childPersonId,
    nivel: nino.nivel,
    tipo: "CLUB",
    semana: true,
  });
  const opciones = await conChoques(
    agrupar(filas, "CLUB", salon.classroomId),
    salon,
    nino.childPersonId,
  );
  const extra = await queryRows<{
    id: string;
    fin: string | null;
    restantes: number;
    agendadoId: string | null;
    retirado: boolean;
  }>(
    `SELECT s.id, t.fin::text AS fin,
            (SELECT count(DISTINCT t2.starts_at)::int FROM scheduling_session t2
              WHERE t2.tanda_id = s.tanda_id AND t2.starts_at > now()) AS restantes,
            -- Inscrito en el club aunque ESTA semana se le haya saltado (chocaba).
            (SELECT g.id FROM scheduling_club_inscripcion i
               JOIN scheduling_agendado g ON g.inscripcion_id = i.id AND g.estado = 'ACTIVA'
              WHERE i.child_person_id = $2 AND i.estado = 'ACTIVA'
                AND (i.tanda_id = s.tanda_id OR i.sesion_id = s.id) AND g.starts_at > now()
              ORDER BY g.starts_at LIMIT 1) AS "agendadoId",
            COALESCE((SELECT i.estado = 'RETIRADA' FROM scheduling_club_inscripcion i
                       WHERE i.child_person_id = $2
                         AND (i.tanda_id = s.tanda_id OR i.sesion_id = s.id)
                       ORDER BY i.inscrito_en DESC LIMIT 1), false) AS retirado
       FROM scheduling_session s LEFT JOIN scheduling_tanda_club t ON t.id = s.tanda_id
      WHERE s.id = ANY($1)`,
    [opciones.map((o) => o.id), nino.childPersonId],
  );
  const porId = new Map(extra.map((e) => [e.id, e]));
  return opciones.map((o) => {
    const e = porId.get(o.id);
    const agendadoId = o.agendadoId ?? e?.agendadoId ?? null;
    return {
      ...o,
      agendadoId,
      enSuLista: agendadoId !== null,
      tanda: e?.fin != null ? { fin: e.fin, restantes: e.restantes } : null,
      retiradoPorFaltas: agendadoId === null && e?.retirado === true,
    };
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
            nivel: input.nino.nivel,
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
                  nivel: input.nino.nivel,
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
    // Un CLUB no se agenda de a una sesión: se INSCRIBE en todas las que le quedan.
    if (input.tipo === "CLUB") {
      const r = await inscribirEnClubTx(tx, {
        salon,
        childPersonId: input.nino.childPersonId,
        rep: filas.find((f) => f.id === opcion.id)!,
        actorUserId: input.actorUserId,
        sobrecupoPor,
      });
      return { startsAt: opcion.startsAt, sobrecupo: r.sobrecupo };
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

/**
 * Lo que se le agendó al niño fuera de su salón y todavía no ocurre. Un CLUB
 * inscrito son muchas semanas: se muestra UNA vez, con la próxima.
 */
export async function agendadosDeNino(childPersonId: string): Promise<Agendado[]> {
  const filas = await queryRows<{
    id: string;
    tipo: TipoAgenda;
    startsAt: string;
    salon: string;
    vigente: boolean;
  }>(
    `SELECT * FROM (
       SELECT DISTINCT ON (COALESCE(a.inscripcion_id, a.id))
              a.id, a.tipo, a.starts_at AS "startsAt", cl.nombre AS salon,
              EXISTS (SELECT 1 FROM scheduling_session s
                       WHERE s.classroom_id = a.classroom_id AND s.starts_at = a.starts_at) AS vigente
         FROM scheduling_agendado a JOIN scheduling_classroom cl ON cl.id = a.classroom_id
        WHERE a.child_person_id = $1 AND a.estado = 'ACTIVA'
          AND a.starts_at > now() - interval '1 day'
        ORDER BY COALESCE(a.inscripcion_id, a.id), a.starts_at
     ) x ORDER BY x."startsAt"`,
    [childPersonId],
  );
  return filas.map((f) => ({ ...f, startsAt: new Date(f.startsAt).toISOString() }));
}

/**
 * Cancela algo agendado (no se borra: queda quién y cuándo). Si es una semana de
 * un CLUB inscrito, cancela la INSCRIPCIÓN: salen todas las semanas que faltan.
 */
export async function cancelarAgendado(input: {
  actorUserId: string;
  childPersonId: string;
  agendadoId: string;
  /**
   * El propio niño (Inscripción Clubes): solo lo de ESE tipo y que aún no
   * empieza. Coordinación cancela cualquier cosa.
   */
  soloFuturoDeTipo?: TipoAgenda;
  ip?: string | null;
}): Promise<void> {
  const tipo = input.soloFuturoDeTipo ?? null;
  const inscripcionId = await withTransaction(async (tx) => {
    const fila = await queryOne<{ inscripcionId: string | null }>(
      `SELECT inscripcion_id AS "inscripcionId" FROM scheduling_agendado
        WHERE id = $1 AND child_person_id = $2 AND estado = 'ACTIVA'
          AND ($3::text IS NULL OR (tipo::text = $3 AND starts_at > now()))
        FOR UPDATE`,
      [input.agendadoId, input.childPersonId, tipo],
      tx,
    );
    if (fila === null) throw new NotFoundError("No hay nada agendado con ese id.");
    if (fila.inscripcionId !== null) {
      await terminarInscripcionTx(tx, {
        inscripcionId: fila.inscripcionId,
        estado: "CANCELADA",
        porUserId: input.actorUserId,
        motivo: null,
      });
    } else {
      await execute(
        `UPDATE scheduling_agendado
            SET estado = 'CANCELADA', cancelado_por = $2, cancelado_en = now()
          WHERE id = $1`,
        [input.agendadoId, input.actorUserId],
        tx,
      );
    }
    return fila.inscripcionId;
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion:
      inscripcionId !== null
        ? "scheduling.club_inscripcion_cancelada"
        : "scheduling.agendado_cancelado",
    entidad: "people_person",
    entidadId: input.childPersonId,
    payload: { agendadoId: input.agendadoId, inscripcionId },
    ip: input.ip ?? null,
  });
}

// —— Clubes de INSCRITOS (2026-10-29) ————————————————————————————————————

/** Faltas SEGUIDAS (AUSENTE; la justificada no cuenta) que retiran de un club. */
export const FALTAS_PARA_RETIRO = 2;

interface SemanaClub {
  id: string;
  grupoId: string | null;
  classroomId: string;
  startsAt: string;
  duracionMin: number;
  limite: number;
  ocupados: number;
  /** Ya está agendado esa semana (en cualquiera de sus salones). */
  yaEsta: boolean;
}

/**
 * INSCRIBE al niño en un club: en la sesión elegida y, si es de una TANDA, en
 * todas las semanas que le quedan. Cada semana es un `scheduling_agendado` con
 * la inscripción, en el salón del niño si el club se dicta ahí y si no, en el
 * mismo salón de la sesión elegida. Va dentro de la transacción de
 * `agendarNino`, que ya comprobó regla, choque y cupo de la sesión elegida; aquí
 * se bloquean y se miden las demás semanas: si alguna está llena, no se
 * inscribe (salvo sobrecupo autorizado), y una semana que choca con algo suyo se
 * salta.
 */
async function inscribirEnClubTx(
  tx: Queryable,
  input: {
    salon: SalonNino;
    childPersonId: string;
    rep: FilaSesion;
    actorUserId: string;
    sobrecupoPor: string | null;
  },
): Promise<{ inscripcionId: string; semanas: number; sobrecupo: boolean }> {
  const { rep } = input;
  if (rep.tandaId !== null) {
    const viva = await queryOne<{ id: string }>(
      `SELECT id FROM scheduling_club_inscripcion
        WHERE child_person_id = $1 AND tanda_id = $2 AND estado = 'ACTIVA'`,
      [input.childPersonId, rep.tandaId],
      tx,
    );
    if (viva !== null) throw new ConflictError("Ya está inscrito en ese club.");
  }
  // Las semanas: la elegida y, en una tanda, las que siguen.
  const filas = await queryRows<SemanaClub>(
    `SELECT s.id, s.grupo_id AS "grupoId", s.classroom_id AS "classroomId",
            s.starts_at AS "startsAt", s.duracion_min AS "duracionMin",
            COALESCE(s.limite_usuarios, cl.cupo) AS limite, ${SQL_EN_LISTA("s")} AS ocupados,
            EXISTS (SELECT 1 FROM scheduling_agendado a
                     WHERE a.child_person_id = $3 AND a.estado = 'ACTIVA'
                       AND a.classroom_id = s.classroom_id AND a.starts_at = s.starts_at) AS "yaEsta"
       FROM scheduling_session s JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE s.tipo = 'CLUB' AND NOT ${SQL_SESION_CANCELADA("s")}
        AND (s.id = $1 OR ($2::uuid IS NOT NULL AND s.tanda_id = $2 AND s.starts_at >= $4))
      ORDER BY s.starts_at, cl.nombre
      FOR UPDATE OF s`,
    [rep.id, rep.tandaId, input.childPersonId, rep.startsAt],
    tx,
  );
  const semanas = porGrupo(filas)
    .map((g) => {
      const elegida =
        g.find((f) => f.classroomId === input.salon.classroomId) ??
        g.find((f) => f.classroomId === rep.classroomId) ??
        g[0]!;
      return { elegida, g, ...cupoDeGrupo("CLUB", g), yaEsta: g.some((f) => f.yaEsta) };
    })
    .sort(
      (a, b) => new Date(a.elegida.startsAt).getTime() - new Date(b.elegida.startsAt).getTime(),
    );

  const llena = semanas.find((s) => estaLleno(s.limite, s.ocupados));
  if (llena !== undefined && input.sobrecupoPor === null) {
    throw new ConflictError("Ese club ya no tiene cupos.", {
      details: { tipo: "sobrecupo", limite: llena.limite, ocupados: llena.ocupados },
    });
  }

  // Lo que ya tiene en todo el rango, para saltar las semanas que chocan.
  const tiene =
    semanas.length === 0
      ? []
      : await compromisos(
          tx,
          input.salon,
          input.childPersonId,
          new Date(new Date(semanas[0]!.elegida.startsAt).getTime() - DIA_MS),
          new Date(new Date(semanas.at(-1)!.elegida.startsAt).getTime() + 2 * DIA_MS),
        );

  const inscripcionId = newId();
  await execute(
    `INSERT INTO scheduling_club_inscripcion
       (id, child_person_id, tanda_id, sesion_id, classroom_id, inscrito_por,
        sobrecupo_autorizado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      inscripcionId,
      input.childPersonId,
      rep.tandaId,
      rep.id,
      rep.classroomId,
      input.actorUserId,
      llena !== undefined ? input.sobrecupoPor : null,
    ],
    tx,
  );
  let creadas = 0;
  for (const s of semanas) {
    if (s.yaEsta) continue;
    const t = tramo(s.elegida.startsAt, s.elegida.duracionMin);
    // La semana elegida ya se comprobó; en las demás, lo que choca se salta.
    if (s.elegida.id !== rep.id && tiene.some((c) => seSolapan(c.tramo, t))) continue;
    await execute(
      `INSERT INTO scheduling_agendado
         (id, classroom_id, starts_at, child_person_id, tipo, agendado_por,
          sobrecupo_autorizado_por, inscripcion_id)
       VALUES ($1, $2, $3, $4, 'CLUB', $5, $6, $7)`,
      [
        newId(),
        s.elegida.classroomId,
        s.elegida.startsAt,
        input.childPersonId,
        input.actorUserId,
        estaLleno(s.limite, s.ocupados) ? input.sobrecupoPor : null,
        inscripcionId,
      ],
      tx,
    );
    creadas++;
  }
  return { inscripcionId, semanas: creadas, sobrecupo: llena !== undefined };
}

/**
 * Termina una inscripción: libera el cupo de las semanas que FALTAN (las ya
 * ocurridas se quedan: son el historial de su asistencia) y la deja como
 * registro, con quién (NULL = el sistema), cuándo y por qué.
 */
async function terminarInscripcionTx(
  tx: Queryable,
  input: {
    inscripcionId: string;
    estado: "CANCELADA" | "RETIRADA";
    porUserId: string | null;
    motivo: string | null;
  },
): Promise<void> {
  await execute(
    `UPDATE scheduling_club_inscripcion
        SET estado = $2, fin_en = now(), fin_por = $3, fin_motivo = $4
      WHERE id = $1 AND estado = 'ACTIVA'`,
    [input.inscripcionId, input.estado, input.porUserId, input.motivo],
    tx,
  );
  await execute(
    `UPDATE scheduling_agendado
        SET estado = 'CANCELADA', cancelado_por = $2, cancelado_en = now()
      WHERE inscripcion_id = $1 AND estado = 'ACTIVA' AND starts_at > now()`,
    [input.inscripcionId, input.porUserId],
    tx,
  );
}

/**
 * La regla de los clubes: con DOS faltas SEGUIDAS se RETIRA al niño y se libera
 * su cupo. Mira las últimas sesiones ya MARCADAS de cada inscripción viva (una
 * sesión sin marca no cuenta ni a favor ni en contra: el guía no pasó lista) y
 * retira si las dos últimas son AUSENTE; una JUSTIFICADA corta la racha.
 * La disparan pasar lista (`marcarAsistencia`) y el worker, como red.
 */
export async function retirarClubesPorFaltas(
  childPersonIds?: string[],
): Promise<{ retiradas: number }> {
  const candidatas = await queryRows<{ id: string; childPersonId: string; tandaId: string | null }>(
    `SELECT i.id, i.child_person_id AS "childPersonId", i.tanda_id AS "tandaId"
       FROM scheduling_club_inscripcion i
      WHERE i.estado = 'ACTIVA'
        AND ($1::uuid[] IS NULL OR i.child_person_id = ANY($1))
        AND (SELECT count(*) FILTER (WHERE u.estado = 'AUSENTE') = $2
                AND count(*) = $2
               FROM (SELECT at.estado::text AS estado
                       FROM scheduling_agendado g
                       JOIN scheduling_session s
                         ON s.classroom_id = g.classroom_id AND s.starts_at = g.starts_at
                       JOIN attendance_attendance at
                         ON at.session_id = s.id AND at.child_person_id = g.child_person_id
                      WHERE g.inscripcion_id = i.id AND g.estado = 'ACTIVA'
                        AND s.starts_at <= now()
                      ORDER BY s.starts_at DESC
                      LIMIT $2) u)`,
    [childPersonIds ?? null, FALTAS_PARA_RETIRO],
  );
  for (const c of candidatas) {
    await withTransaction((tx) =>
      terminarInscripcionTx(tx, {
        inscripcionId: c.id,
        estado: "RETIRADA",
        porUserId: null,
        motivo: `${String(FALTAS_PARA_RETIRO)} faltas seguidas`,
      }),
    );
    await registrarAuditoria({
      actorUserId: null,
      accion: "scheduling.club_retirado_por_faltas",
      entidad: "people_person",
      entidadId: c.childPersonId,
      payload: { inscripcionId: c.id, tandaId: c.tandaId, faltas: FALTAS_PARA_RETIRO },
    });
  }
  return { retiradas: candidatas.length };
}
