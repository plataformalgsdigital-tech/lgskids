import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { wallTimeToUtc } from "@/platform/time";
import { cuposLibres, validarWelcome, type NivelWelcome } from "../domain/welcome";
import { JOIN_NOMBRE_GUIA, NOMBRE_GUIA } from "../infrastructure/scheduling-repository";

/**
 * WELCOME (2026-10-09): la sesión de bienvenida que el niño AGENDA al crear su
 * perfil, antes de que empiece su curso.
 *
 * Es la única excepción al modelo de cohortes ("el niño no agenda"): todavía no
 * tiene clases, y el Welcome no es una clase de su salón sino una sesión
 * común que dicta UN guía en UNA sala de Zoom para niños de varios salones,
 * países y campañas. Por eso vive en tablas propias y su asistencia NO pasa por
 * `attendance_attendance` ni dispara la progresión (regla 4).
 *
 * La hora es un INSTANTE: se escribe en el reloj de quien lo crea y cada quien
 * la ve en el suyo (como el evento administrativo).
 */

type Queryable = Pick<PoolClient, "query">;

/**
 * QUÉ Welcome le sirve a un niño. Un solo fragmento para la lista que ve y
 * para la reserva: si se calcularan aparte, la lista ofrecería un Welcome que
 * la reserva después rechaza.
 *
 * Requiere `w` (el Welcome), `ncl` (el salón del niño) y `nco` (su curso), y el
 * nivel del niño como parámetro.
 */
function sqlElegible(pNivel: string): string {
  return `w.starts_at > now()
      AND w.nivel = ${pNivel}
      AND (w.classroom_id IS NULL OR w.classroom_id = ncl.id)
      AND (w.campaign_id IS NULL OR w.campaign_id = nco.campaign_id)
      AND (w.curso IS NULL OR w.curso = nco.tipo::text)
      AND (w.pais IS NULL OR w.pais = ncl.holiday_country)
      AND w.starts_at < (nco.inicio::timestamp AT TIME ZONE ncl.timezone)`;
}

const INSCRITOS = `(SELECT count(*) FROM scheduling_welcome_reserva r
                     WHERE r.welcome_id = w.id AND r.estado = 'ACTIVA')::int`;

export interface WelcomeResumen {
  id: string;
  startsAt: string;
  duracionMin: number;
  guiaUserId: string;
  guia: string;
  campaignId: string | null;
  campania: string | null;
  pais: string | null;
  curso: string | null;
  classroomId: string | null;
  salon: string | null;
  nivel: string;
  limiteUsuarios: number;
  inscritos: number;
  observaciones: string | null;
}

const SELECT_WELCOME = `
  SELECT w.id, w.starts_at AS "startsAt", w.duracion_min AS "duracionMin",
         w.guia_user_id AS "guiaUserId", ${NOMBRE_GUIA} AS guia,
         w.campaign_id AS "campaignId", ca.nombre AS campania, w.pais::text AS pais,
         w.curso, w.classroom_id AS "classroomId", cl.nombre AS salon, w.nivel,
         w.limite_usuarios AS "limiteUsuarios", ${INSCRITOS} AS inscritos, w.observaciones
    FROM scheduling_welcome w
    JOIN identity_user gu ON gu.id = w.guia_user_id
    ${JOIN_NOMBRE_GUIA}
    LEFT JOIN catalog_campaign ca ON ca.id = w.campaign_id
    LEFT JOIN scheduling_classroom cl ON cl.id = w.classroom_id`;

export async function crearWelcome(input: {
  actorUserId: string;
  /** Fecha y hora en el reloj de quien lo crea (`zona`). */
  fecha: string;
  horaLocal: string;
  zona: string;
  duracionMin: number;
  guiaUserId: string;
  /** null = todas las campañas / países / cursos / salones. */
  campaignId: string | null;
  pais: string | null;
  curso: string | null;
  classroomId: string | null;
  nivel: NivelWelcome;
  limiteUsuarios: number;
  observaciones?: string | null;
  ip?: string | null;
}): Promise<{ id: string; salones: number }> {
  const invalido = validarWelcome(input);
  if (invalido !== null) throw new ValidationError(invalido);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.zona }).format(new Date());
  } catch {
    throw new ValidationError(`Zona horaria desconocida: ${input.zona}.`);
  }
  const [y, m, d] = input.fecha.split("-").map(Number);
  const [hh, mm] = input.horaLocal.split(":").map(Number);
  const startsAt = wallTimeToUtc(
    { year: y ?? 0, month: m ?? 0, day: d ?? 0, hour: hh ?? 0, minute: mm ?? 0 },
    input.zona,
  );
  if (startsAt.getTime() <= Date.now()) {
    throw new ValidationError("El Welcome tiene que ser en el futuro.");
  }

  const guia = await queryOne<{ id: string }>(
    `SELECT id FROM identity_user WHERE id = $1 AND estado = 'ACTIVO'`,
    [input.guiaUserId],
  );
  if (guia === null) throw new NotFoundError("El guía no existe o está inactivo.");

  // El Welcome es SIEMPRE antes de que empiece el curso: tiene que haber al
  // menos un salón, con esos filtros, cuyo curso arranque después. Esto valida
  // también que el salón elegido sea coherente con campaña, país y curso.
  const salones = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM scheduling_classroom cl
       JOIN catalog_course co ON co.id = cl.course_id
      WHERE cl.activo
        AND ($1::uuid IS NULL OR co.campaign_id = $1)
        AND ($2::text IS NULL OR cl.holiday_country = $2)
        AND ($3::text IS NULL OR co.tipo::text = $3)
        AND ($4::uuid IS NULL OR cl.id = $4)
        AND $5::timestamptz < (co.inicio::timestamp AT TIME ZONE cl.timezone)`,
    [input.campaignId, input.pais, input.curso, input.classroomId, startsAt],
  );
  if ((salones?.n ?? 0) === 0) {
    throw new ValidationError(
      "Ningún salón con esos filtros empieza su curso después de esa fecha: el Welcome se hace antes del inicio del curso.",
    );
  }

  const id = newId();
  await execute(
    `INSERT INTO scheduling_welcome
       (id, starts_at, timezone, fecha, duracion_min, guia_user_id, campaign_id, pais, curso,
        classroom_id, nivel, limite_usuarios, observaciones, creado_por)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      startsAt,
      input.zona,
      input.fecha,
      input.duracionMin,
      input.guiaUserId,
      input.campaignId,
      input.pais,
      input.curso,
      input.classroomId,
      input.nivel,
      input.limiteUsuarios,
      input.observaciones?.trim() || null,
      input.actorUserId,
    ],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.welcome_creado",
    entidad: "scheduling_welcome",
    entidadId: id,
    payload: {
      fecha: input.fecha,
      hora: input.horaLocal,
      zona: input.zona,
      campaignId: input.campaignId,
      pais: input.pais,
      curso: input.curso,
      classroomId: input.classroomId,
      nivel: input.nivel,
      limite: input.limiteUsuarios,
      salones: salones?.n ?? 0,
    },
    ip: input.ip ?? null,
  });
  return { id, salones: salones?.n ?? 0 };
}

/**
 * Welcomes de un rango de fechas (para el calendario). Se amplía un día por
 * cada lado: la casilla sale del reloj de quien mira, no del de quien lo creó.
 * Con `guiaUserId`, solo los que dicta ese guía.
 */
export async function listarWelcomes(
  desde: string,
  hasta: string,
  guiaUserId: string | null,
): Promise<WelcomeResumen[]> {
  const values: unknown[] = [desde, hasta];
  let filtro = "";
  if (guiaUserId !== null) {
    values.push(guiaUserId);
    filtro = "AND w.guia_user_id = $3";
  }
  return queryRows<WelcomeResumen>(
    `${SELECT_WELCOME}
      WHERE w.starts_at >= ($1::date - 1) AND w.starts_at < ($2::date + 2)
        ${filtro}
      ORDER BY w.starts_at`,
    values,
  );
}

export interface InscritoWelcome {
  reservaId: string;
  childPersonId: string;
  nombre: string;
  documento: string;
  salon: string | null;
  curso: string | null;
  asistio: boolean | null;
  agendadoEn: string;
}

export async function detalleWelcome(
  id: string,
): Promise<{ welcome: WelcomeResumen; inscritos: InscritoWelcome[] }> {
  const welcome = await queryOne<WelcomeResumen>(`${SELECT_WELCOME} WHERE w.id = $1`, [id]);
  if (welcome === null) throw new NotFoundError("El Welcome no existe.");
  const inscritos = await queryRows<InscritoWelcome>(
    `SELECT r.id AS "reservaId", p.id AS "childPersonId",
            TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)) AS nombre,
            TRIM(CONCAT_WS(' ', p.doc_tipo, p.doc_numero)) AS documento,
            cl.nombre AS salon, co.tipo::text AS curso,
            r.asistio, r.created_at AS "agendadoEn"
       FROM scheduling_welcome_reserva r
       JOIN people_person p ON p.id = r.child_person_id
       LEFT JOIN LATERAL (
         SELECT e.classroom_id FROM enrollment_enrollment e
          WHERE e.child_person_id = p.id AND e.estado IN ('ACTIVA', 'RESERVADA')
          ORDER BY e.created_at DESC LIMIT 1) m ON true
       LEFT JOIN scheduling_classroom cl ON cl.id = m.classroom_id
       LEFT JOIN catalog_course co ON co.id = cl.course_id
      WHERE r.welcome_id = $1 AND r.estado = 'ACTIVA'
      ORDER BY p.apellidos, p.nombres`,
    [id],
  );
  return { welcome, inscritos };
}

/** El guía que dicta el Welcome (para acotar al guía que no gestiona salones). */
export async function guiaDeWelcome(id: string): Promise<string> {
  const row = await queryOne<{ guia: string }>(
    `SELECT guia_user_id AS guia FROM scheduling_welcome WHERE id = $1`,
    [id],
  );
  if (row === null) throw new NotFoundError("El Welcome no existe.");
  return row.guia;
}

/** Se borra solo sin niños agendados: si no, se quedarían sin bienvenida sin saberlo. */
export async function eliminarWelcome(input: {
  actorUserId: string;
  id: string;
  ip?: string | null;
}): Promise<void> {
  const { welcome } = await detalleWelcome(input.id);
  if (welcome.inscritos > 0) {
    throw new ConflictError(
      `Tiene ${String(welcome.inscritos)} niño(s) agendado(s): no se puede borrar.`,
    );
  }
  await execute(`DELETE FROM scheduling_welcome WHERE id = $1`, [input.id]);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.welcome_eliminado",
    entidad: "scheduling_welcome",
    entidadId: input.id,
    payload: { startsAt: welcome.startsAt, guia: welcome.guia },
    ip: input.ip ?? null,
  });
}

/**
 * Pasa lista del Welcome. Solo toca a niños AGENDADOS en él: marcar a quien no
 * se inscribió sería inventar un dato.
 */
export async function marcarAsistenciaWelcome(input: {
  actorUserId: string;
  id: string;
  marcas: { childPersonId: string; asistio: boolean | null }[];
  ip?: string | null;
}): Promise<{ marcados: number }> {
  await guiaDeWelcome(input.id);
  let marcados = 0;
  await withTransaction(async (tx) => {
    for (const m of input.marcas) {
      marcados += await execute(
        `UPDATE scheduling_welcome_reserva
            SET asistio = $3::boolean,
                marcado_en = CASE WHEN $3::boolean IS NULL THEN NULL ELSE now() END,
                marcado_por = CASE WHEN $3::boolean IS NULL THEN NULL ELSE $4::uuid END
          WHERE welcome_id = $1 AND child_person_id = $2 AND estado = 'ACTIVA'`,
        [input.id, m.childPersonId, m.asistio, input.actorUserId],
        tx,
      );
    }
  });
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.welcome_asistencia",
    entidad: "scheduling_welcome",
    entidadId: input.id,
    payload: { marcados },
    ip: input.ip ?? null,
  });
  return { marcados };
}

// —— Lo que ve y agenda el niño ———————————————————————————————————————————

export interface WelcomeDisponible extends WelcomeResumen {
  libres: number;
}

/**
 * Los Welcome que le sirven a un niño: de su campaña, país, curso y salón (o
 * "todos"), de su nivel, futuros y anteriores al inicio de su curso. Incluye
 * los LLENOS, con `libres = 0`, para que la pantalla los muestre deshabilitados.
 */
export async function welcomesDisponibles(nino: {
  classroomId: string;
  nivel: string;
}): Promise<WelcomeDisponible[]> {
  const filas = await queryRows<WelcomeResumen>(
    `${SELECT_WELCOME}
       JOIN scheduling_classroom ncl ON ncl.id = $1
       JOIN catalog_course nco ON nco.id = ncl.course_id
      WHERE ${sqlElegible("$2")}
      ORDER BY w.starts_at`,
    [nino.classroomId, nino.nivel],
  );
  return filas.map((w) => ({ ...w, libres: cuposLibres(w.limiteUsuarios, w.inscritos) }));
}

/**
 * Agenda (o cambia) el Welcome de un niño DENTRO de una transacción. Bloquea la
 * fila del Welcome para que dos niños no se lleven el último cupo a la vez, y
 * vuelve a comprobar con la MISMA regla de la lista que le corresponde.
 */
export async function reservarWelcomeTx(
  tx: Queryable,
  input: {
    welcomeId: string;
    childPersonId: string;
    classroomId: string;
    nivel: string;
    /** null = lo agendó el propio niño desde su enlace. */
    agendadoPor: string | null;
  },
): Promise<{ reservaId: string; startsAt: string }> {
  const bloqueado = await queryOne<{ id: string }>(
    `SELECT id FROM scheduling_welcome WHERE id = $1 FOR UPDATE`,
    [input.welcomeId],
    tx,
  );
  if (bloqueado === null) throw new NotFoundError("Ese Welcome ya no existe.");

  const w = await queryOne<{ limite: number; inscritos: number; startsAt: string }>(
    `SELECT w.limite_usuarios AS limite, ${INSCRITOS} AS inscritos, w.starts_at AS "startsAt"
       FROM scheduling_welcome w
       JOIN scheduling_classroom ncl ON ncl.id = $2
       JOIN catalog_course nco ON nco.id = ncl.course_id
      WHERE w.id = $1 AND ${sqlElegible("$3")}`,
    [input.welcomeId, input.classroomId, input.nivel],
    tx,
  );
  if (w === null) throw new ConflictError("Ese Welcome no está disponible para este niño.");

  const actual = await queryOne<{ id: string; welcomeId: string }>(
    `SELECT id, welcome_id AS "welcomeId" FROM scheduling_welcome_reserva
      WHERE child_person_id = $1 AND estado = 'ACTIVA' FOR UPDATE`,
    [input.childPersonId],
    tx,
  );
  if (actual !== null && actual.welcomeId === input.welcomeId) {
    return { reservaId: actual.id, startsAt: w.startsAt };
  }
  if (cuposLibres(w.limite, w.inscritos) === 0) {
    throw new ConflictError("Ese Welcome se llenó: elige otro horario.");
  }
  if (actual !== null) {
    await execute(
      `UPDATE scheduling_welcome_reserva SET estado = 'CANCELADA', cancelada_en = now()
        WHERE id = $1`,
      [actual.id],
      tx,
    );
  }
  const reservaId = newId();
  await execute(
    `INSERT INTO scheduling_welcome_reserva (id, welcome_id, child_person_id, agendado_por)
     VALUES ($1, $2, $3, $4)`,
    [reservaId, input.welcomeId, input.childPersonId, input.agendadoPor],
    tx,
  );
  return { reservaId, startsAt: w.startsAt };
}

export interface WelcomeDeNino {
  welcomeId: string;
  startsAt: string;
  duracionMin: number;
  guia: string;
  zoomUrl: string | null;
  asistio: boolean | null;
}

/** El Welcome que el niño tiene agendado (el ACTIVO), con la sala del guía. */
export async function welcomeDeNino(childPersonId: string): Promise<WelcomeDeNino | null> {
  return queryOne<WelcomeDeNino>(
    `SELECT w.id AS "welcomeId", w.starts_at AS "startsAt", w.duracion_min AS "duracionMin",
            ${NOMBRE_GUIA} AS guia, gg.zoom_url AS "zoomUrl", r.asistio
       FROM scheduling_welcome_reserva r
       JOIN scheduling_welcome w ON w.id = r.welcome_id
       JOIN identity_user gu ON gu.id = w.guia_user_id
       ${JOIN_NOMBRE_GUIA}
      WHERE r.child_person_id = $1 AND r.estado = 'ACTIVA'`,
    [childPersonId],
  );
}
