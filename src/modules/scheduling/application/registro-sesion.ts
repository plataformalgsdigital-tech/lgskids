import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { crearEvento } from "./crear-evento";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { withTransaction } from "@/platform/db/transaction";

/**
 * Registro de sesión y solicitud de repetición.
 *
 * Reparto de poder (lo pidió el negocio):
 *  - El GUÍA cierra la sesión que dictó y puede SOLICITAR repetirla.
 *  - Suspender y aprobar la repetición son del coordinador (`salones.gestionar`).
 *
 * Cerrar deja constancia en el evento del calendario y alimenta el conteo
 * mensual por guía.
 */

export interface RegistroSesion {
  sessionId: string;
  guiaUserId: string | null;
  cerradaPor: string | null;
  cerradaEn: string | null;
  /** Hora de pared reportada por el guía, en la zona del salón. */
  horaReal: string | null;
  notaSesion: string | null;
  sinAsistentes: boolean;
}

/**
 * El guía marca la sesión como dictada.
 *
 * Además fija `guia_user_id` si estaba vacío: el salón puede cambiar de guía
 * más adelante y el histórico debe recordar quién la dictó de verdad.
 */
export async function cerrarSesion(input: {
  actorUserId: string;
  sessionId: string;
  /** Hora a la que se dictó (HH:MM), en la zona del salón. */
  horaReal: string;
  nota?: string | null;
  /** El guía confirmó que NO asistió nadie. Obligatorio si no hay marcas. */
  sinAsistentes?: boolean;
  ip?: string | null;
}): Promise<RegistroSesion> {
  const sesion = await queryOne<{
    id: string;
    classroom_id: string;
    salon: string;
    fecha: string;
    starts_at: string;
    cerrada_en: string | null;
    guia_salon: string | null;
  }>(
    `SELECT s.id, s.classroom_id, cl.nombre AS salon, s.fecha::text AS fecha,
            s.starts_at::text AS starts_at, s.cerrada_en::text AS cerrada_en,
            cl.guia_user_id AS guia_salon
       FROM scheduling_session s
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
      WHERE s.id = $1`,
    [input.sessionId],
  );
  if (sesion === null) throw new NotFoundError("La sesión no existe.");
  if (sesion.cerrada_en !== null) {
    throw new ConflictError("Esta sesión ya fue cerrada.");
  }
  if (new Date(sesion.starts_at).getTime() > Date.now()) {
    throw new ValidationError("No se puede cerrar una sesión que todavía no empieza.");
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.horaReal)) {
    throw new ValidationError("La hora debe ser HH:MM.");
  }

  // Cerrar sin ninguna marca es válido —puede que no llegara nadie— pero exige
  // decirlo a propósito: en los reportes no es lo mismo que olvidar marcar.
  const marcas = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM attendance_attendance WHERE session_id = $1`,
    [input.sessionId],
  );
  const hayMarcas = marcas !== null && Number(marcas.n) > 0;
  if (!hayMarcas && input.sinAsistentes !== true) {
    throw new ValidationError(
      "No hay ninguna asistencia marcada. Confirma que no asistió nadie para poder registrar la sesión.",
    );
  }

  await execute(
    `UPDATE scheduling_session
        SET cerrada_por = $2,
            cerrada_en = now(),
            guia_user_id = COALESCE(guia_user_id, $3),
            hora_real = $4::time,
            nota_sesion = $5,
            sin_asistentes = $6
      WHERE id = $1`,
    [
      input.sessionId,
      input.actorUserId,
      sesion.guia_salon ?? input.actorUserId,
      input.horaReal,
      input.nota?.trim() === "" ? null : (input.nota ?? null),
      !hayMarcas,
    ],
  );

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.sesion_cerrada",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: {
      salon: sesion.salon,
      fecha: sesion.fecha,
      horaReal: input.horaReal,
      sinAsistentes: !hayMarcas,
    },
    ip: input.ip ?? null,
  });

  return leerRegistro(input.sessionId);
}

/** Reabre una sesión cerrada. Solo coordinación (lo exige el endpoint). */
export async function reabrirSesion(input: {
  actorUserId: string;
  sessionId: string;
  ip?: string | null;
}): Promise<RegistroSesion> {
  await execute(
    `UPDATE scheduling_session
        SET cerrada_por = NULL, cerrada_en = NULL,
            hora_real = NULL, nota_sesion = NULL, sin_asistentes = FALSE
      WHERE id = $1`,
    [input.sessionId],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.sesion_reabierta",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: {},
    ip: input.ip ?? null,
  });
  return leerRegistro(input.sessionId);
}

async function leerRegistro(sessionId: string): Promise<RegistroSesion> {
  const fila = await queryOne<RegistroSesion>(
    `SELECT id AS "sessionId", guia_user_id AS "guiaUserId",
            cerrada_por AS "cerradaPor", cerrada_en::text AS "cerradaEn",
            to_char(hora_real, 'HH24:MI') AS "horaReal",
            nota_sesion AS "notaSesion", sin_asistentes AS "sinAsistentes"
       FROM scheduling_session WHERE id = $1`,
    [sessionId],
  );
  if (fila === null) throw new NotFoundError("La sesión no existe.");
  return fila;
}

export interface Repeticion {
  id: string;
  sessionId: string;
  solicitadoPor: string;
  solicitante: string | null;
  motivo: string;
  repetirLeccion: boolean;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  resueltoPor: string | null;
  resueltoEn: string | null;
  notaResolucion: string | null;
  createdAt: string;
}

/** El guía pide repetir la sesión (y opcionalmente la lección). */
export async function solicitarRepeticion(input: {
  actorUserId: string;
  sessionId: string;
  motivo: string;
  repetirLeccion: boolean;
  /** Lección de `catalog_curso` que hay que repetir. Es REFERENCIA: sirve para
   *  que coordinación sepa de qué se trata y para rotular la clase extra. */
  cursoRefId?: string | null;
  ip?: string | null;
}): Promise<{ id: string }> {
  const motivo = input.motivo.trim();
  if (motivo.length < 5) {
    throw new ValidationError("Explica el motivo de la repetición (mínimo 5 caracteres).");
  }
  const sesion = await queryOne<{ id: string }>(`SELECT id FROM scheduling_session WHERE id = $1`, [
    input.sessionId,
  ]);
  if (sesion === null) throw new NotFoundError("La sesión no existe.");

  const viva = await queryOne<{ id: string }>(
    `SELECT id FROM scheduling_repeticion WHERE session_id = $1 AND estado = 'PENDIENTE'`,
    [input.sessionId],
  );
  if (viva !== null) {
    throw new ConflictError("Ya hay una solicitud pendiente para esta sesión.");
  }

  const id = newId();
  await execute(
    `INSERT INTO scheduling_repeticion
       (id, session_id, solicitado_por, motivo, repetir_leccion, curso_ref_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      input.sessionId,
      input.actorUserId,
      motivo,
      input.repetirLeccion,
      input.cursoRefId ?? null,
    ],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "scheduling.repeticion_solicitada",
    entidad: "scheduling_session",
    entidadId: input.sessionId,
    payload: { motivo, repetirLeccion: input.repetirLeccion },
    ip: input.ip ?? null,
  });
  return { id };
}

/**
 * Coordinación aprueba o rechaza.
 *
 * Aprobar CREA una clase EXTRA (refuerzo). No se extiende el curso ni se toca
 * `final_curso` (regla 1): es un evento adicional con su propia fecha y hora,
 * y por eso hay que dárselas — el horario regular del salón ya está ocupado.
 *
 * Nace como evento suelto (sin slot), así que regenerar el salón —que es
 * destructivo por diseño— no se lo lleva por delante.
 *
 * Aprobar y crear van en la MISMA transacción: una solicitud aprobada sin su
 * clase sería una promesa que nadie ve en el calendario.
 */
export async function resolverRepeticion(input: {
  actorUserId: string;
  repeticionId: string;
  aprobar: boolean;
  nota?: string | null;
  /** Cuándo se dicta el refuerzo. Obligatorio al aprobar. */
  refuerzo?: {
    fecha: string;
    horaLocal: string;
    duracionMin: number;
    /** Por defecto, quien dictó la sesión original. */
    guiaUserId?: string | null;
  } | null;
  ip?: string | null;
}): Promise<{ sesionRefuerzoId: string | null }> {
  let sesionRefuerzoId: string | null = null;

  await withTransaction(async (tx) => {
    const fila = await queryOne<{
      session_id: string;
      estado: string;
      motivo: string;
      classroom_id: string;
      fecha: string;
      duracion_min: number;
      guia_original: string | null;
      ref_nivel: string | null;
      ref_unidad: string | null;
      ref_leccion: string | null;
    }>(
      `SELECT r.session_id, r.estado, r.motivo,
              s.classroom_id, s.fecha::text AS fecha, s.duracion_min,
              COALESCE(s.guia_user_id, cl.guia_user_id) AS guia_original,
              cr.nivel AS ref_nivel, cr.unidad AS ref_unidad, cr.leccion AS ref_leccion
         FROM scheduling_repeticion r
         JOIN scheduling_session s ON s.id = r.session_id
         JOIN scheduling_classroom cl ON cl.id = s.classroom_id
         LEFT JOIN catalog_curso cr ON cr.id = r.curso_ref_id
        WHERE r.id = $1
        FOR UPDATE OF r`,
      [input.repeticionId],
      tx,
    );
    if (fila === null) throw new NotFoundError("La solicitud no existe.");
    if (fila.estado !== "PENDIENTE") {
      throw new ConflictError("Esa solicitud ya fue resuelta.");
    }

    if (input.aprobar) {
      if (input.refuerzo == null) {
        throw new ValidationError("Indica la fecha y la hora de la clase de refuerzo.");
      }
      const guiaUserId = input.refuerzo.guiaUserId ?? fila.guia_original;
      if (guiaUserId === null) {
        throw new ValidationError("El salón no tiene guía asignado: elige uno para el refuerzo.");
      }
      // La lección va en el rótulo de la clase extra: el guía y el alumno
      // tienen que ver QUÉ se va a repetir, no solo que hay una sesión más.
      const leccion =
        fila.ref_leccion === null
          ? ""
          : ` Lección: ${[fila.ref_nivel, fila.ref_unidad, fila.ref_leccion]
              .filter((x) => x !== null && x !== "")
              .join(" · ")}.`;
      const { sesiones } = await crearEvento({
        actorUserId: input.actorUserId,
        classroomIds: [fila.classroom_id],
        tipo: "SESION",
        fecha: input.refuerzo.fecha,
        horaLocal: input.refuerzo.horaLocal,
        duracionMin: input.refuerzo.duracionMin,
        guiaUserId,
        nivel: fila.ref_nivel,
        observaciones: `Refuerzo de la sesión del ${fila.fecha}.${leccion} ${fila.motivo}`,
        client: tx,
        ip: input.ip ?? null,
      });
      sesionRefuerzoId = sesiones[0]?.id ?? null;
    }

    await execute(
      `UPDATE scheduling_repeticion
          SET estado = $2, resuelto_por = $3, resuelto_en = now(),
              nota_resolucion = $4, sesion_refuerzo_id = $5
        WHERE id = $1`,
      [
        input.repeticionId,
        input.aprobar ? "APROBADA" : "RECHAZADA",
        input.actorUserId,
        input.nota ?? null,
        sesionRefuerzoId,
      ],
      tx,
    );
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: input.aprobar ? "scheduling.repeticion_aprobada" : "scheduling.repeticion_rechazada",
    entidad: "scheduling_repeticion",
    entidadId: input.repeticionId,
    payload: { nota: input.nota ?? null, sesionRefuerzoId },
    ip: input.ip ?? null,
  });

  return { sesionRefuerzoId };
}

/** Solicitudes de una sesión, para pintarlas en el evento del calendario. */
export async function repeticionesDeSesion(sessionId: string): Promise<Repeticion[]> {
  return queryRows<Repeticion>(
    `SELECT r.id, r.session_id AS "sessionId", r.solicitado_por AS "solicitadoPor",
            u.username AS solicitante, r.motivo, r.repetir_leccion AS "repetirLeccion",
            r.estado, r.resuelto_por AS "resueltoPor", r.resuelto_en::text AS "resueltoEn",
            r.nota_resolucion AS "notaResolucion", r.created_at::text AS "createdAt"
       FROM scheduling_repeticion r
       LEFT JOIN identity_user u ON u.id = r.solicitado_por
      WHERE r.session_id = $1
      ORDER BY r.created_at DESC`,
    [sessionId],
  );
}

export interface FilaRefuerzo {
  id: string;
  sessionId: string;
  campania: string;
  cursoTipo: string;
  classroomId: string;
  guiaUserId: string | null;
  pais: string | null;
  salon: string;
  guia: string | null;
  /** Fecha de la sesión que se pide repetir (local del salón). */
  fechaEvento: string;
  /** Número de sesión en el curso; 0 en eventos sueltos. */
  numero: number;
  nivel: string | null;
  motivo: string;
  repetirLeccion: boolean;
  /** Lección que el guía pidió repetir, ya legible. Referencia, no operativo. */
  leccionRef: string | null;
  solicitante: string | null;
  solicitadoEn: string;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  notaResolucion: string | null;
  /** Fecha de la clase extra, cuando ya se aprobó. */
  fechaRefuerzo: string | null;
}

/**
 * Bandeja de refuerzos para coordinación, con los filtros de la pantalla.
 *
 * Las fechas de `desde`/`hasta` filtran por FECHA DE SOLICITUD, que es lo que
 * ordena el trabajo del coordinador; la fecha del evento va como dato.
 */
export async function listarRefuerzos(
  filtros: {
    estado?: "PENDIENTE" | "APROBADA" | "RECHAZADA" | "TODAS";
    guiaUserId?: string | null;
    cursoTipo?: string | null;
    classroomId?: string | null;
    desde?: string | null;
    hasta?: string | null;
    limite?: number;
  } = {},
): Promise<FilaRefuerzo[]> {
  const cond: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${String(params.length)}`;
  };

  const estado = filtros.estado ?? "PENDIENTE";
  if (estado !== "TODAS") cond.push(`r.estado = ${p(estado)}`);
  if (filtros.guiaUserId)
    cond.push(`COALESCE(s.guia_user_id, cl.guia_user_id) = ${p(filtros.guiaUserId)}`);
  if (filtros.cursoTipo) cond.push(`cu.tipo::text = ${p(filtros.cursoTipo)}`);
  if (filtros.classroomId) cond.push(`cl.id = ${p(filtros.classroomId)}`);
  if (filtros.desde) cond.push(`r.created_at >= ${p(filtros.desde)}::date`);
  // +1 día para que "hasta" incluya todo ese día, no solo su medianoche.
  if (filtros.hasta) cond.push(`r.created_at < (${p(filtros.hasta)}::date + 1)`);

  const where = cond.length > 0 ? `WHERE ${cond.join(" AND ")}` : "";
  const limite = Math.min(Math.max(filtros.limite ?? 200, 1), 500);

  return queryRows<FilaRefuerzo>(
    `SELECT r.id, r.session_id AS "sessionId",
            ca.nombre AS campania, cu.tipo::text AS "cursoTipo",
            cl.holiday_country AS pais,
            cl.id AS "classroomId", cl.nombre AS salon,
            COALESCE(s.guia_user_id, cl.guia_user_id) AS "guiaUserId",
            COALESCE(gu.username, '') AS guia,
            s.fecha::text AS "fechaEvento", s.numero, s.nivel,
            r.motivo, r.repetir_leccion AS "repetirLeccion",
            NULLIF(CONCAT_WS(' · ', cr.nivel, cr.unidad, cr.leccion), '') AS "leccionRef",
            su.username AS solicitante, r.created_at::text AS "solicitadoEn",
            r.estado, r.nota_resolucion AS "notaResolucion",
            ref.fecha::text AS "fechaRefuerzo"
       FROM scheduling_repeticion r
       JOIN scheduling_session s ON s.id = r.session_id
       JOIN scheduling_classroom cl ON cl.id = s.classroom_id
       JOIN catalog_course cu ON cu.id = cl.course_id
       JOIN catalog_campaign ca ON ca.id = cu.campaign_id
       LEFT JOIN identity_user gu ON gu.id = COALESCE(s.guia_user_id, cl.guia_user_id)
       LEFT JOIN identity_user su ON su.id = r.solicitado_por
       LEFT JOIN scheduling_session ref ON ref.id = r.sesion_refuerzo_id
       LEFT JOIN catalog_curso cr ON cr.id = r.curso_ref_id
       ${where}
      ORDER BY r.created_at DESC
      LIMIT ${p(limite)}`,
    params,
  );
}
