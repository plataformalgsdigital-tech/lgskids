import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import type { PoolClient } from "pg";
import {
  CLAVE_CONTEXTO_ALUMNO,
  ENTREGAS_BASE,
  ENTREGAS_TOPE,
  UNIDADES_PROYECTO,
  type AlumnoLibro,
  type DecisionProyecto,
  type EntregaLibro,
  type EntregaRegistrada,
  type UnidadLibro,
  alumnoValido,
  clavesLibro,
  clavesQueGuarda,
  clavesSoloLectura,
  contextoAlumno,
  leerProyectosLibro,
  planificarEntregas,
  problemaRevision,
  proyectosParaLibro,
  puntajesAprueban,
  resumenEvaluacionesLibro,
  revisionesParaLibro,
} from "../domain/proyectos-libro";
import { misionesAutorizadas } from "./misiones";

/**
 * EL LIBRO DEL ALUMNO EN EL SERVIDOR (2026-11-06).
 *
 * Hasta ahora el progreso del libro vivía solo en el navegador del niño. Con
 * los proyectos que revisa el guía eso no alcanza: la entrega tiene que llegar
 * a la plataforma y la revisión tiene que volver al libro. Aquí:
 *
 * - `sincronizarLibroAlumno`: lo que el libro guardó (evaluaciones, práctica,
 *   borradores y entregas) llega por el panel del niño; se guarda como REGISTRO
 *   y cada entrega nueva se registra si cumple la regla (`planificarEntregas`).
 * - `datosLibroParaAlumno`: lo que la plataforma le DA al libro al abrirlo —su
 *   identidad, sus entregas registradas y las revisiones—. Esas claves son de
 *   solo lectura para el libro (el puente no deja escribirlas).
 * - `revisarProyecto` / `autorizarEntregaExtra`: las acciones del guía.
 *
 * Nada de esto es progresión (regla 4): un proyecto aprobado no da medallas.
 */

const ESTADO = "catalog_libro_estado";
/** Tope de lo que se guarda por clave: el avance de un nivel ronda decenas de KB. */
const TOPE_VALOR = 1_000_000;
const TOPE_COMENTARIO = 2000;

type Q = PoolClient | undefined;

/** Lo que identifica al niño ante el libro: su ID (documento), nombre y usuario. */
async function alumnoDeNino(childPersonId: string, client?: Q): Promise<AlumnoLibro | null> {
  const fila = await queryOne<{ id: string; name: string; username: string | null }>(
    `SELECT p.doc_numero AS id, TRIM(CONCAT_WS(' ', p.nombres, p.apellidos)) AS name,
            u.username
       FROM people_person p LEFT JOIN identity_user u ON u.id = p.user_id
      WHERE p.id = $1`,
    [childPersonId],
    client,
  );
  if (fila === null || fila.username === null) return null;
  const a = { id: fila.id, name: fila.name, username: fila.username };
  return alumnoValido(a) ? a : null;
}

interface FilaEntrega {
  id: string;
  submissionId: string;
  unidad: number;
  intento: number;
  texto: string;
  enviadoEn: string | null;
  recibidoEn: Date;
  decision: DecisionProyecto | null;
  puntajes: number[] | null;
}

async function entregasDe(
  childPersonId: string,
  curso: string,
  nivel: string,
  client?: Q,
): Promise<FilaEntrega[]> {
  return queryRows<FilaEntrega>(
    `SELECT e.id, e.submission_id AS "submissionId", e.unidad, e.intento, e.texto,
            e.enviado_en AS "enviadoEn", e.recibido_en AS "recibidoEn",
            r.decision, r.puntajes
       FROM catalog_proyecto_entrega e
       LEFT JOIN LATERAL (
         SELECT rv.decision, rv.puntajes FROM catalog_proyecto_revision rv
          WHERE rv.entrega_id = e.id ORDER BY rv.revisado_en DESC, rv.id DESC LIMIT 1
       ) r ON true
      WHERE e.child_person_id = $1 AND e.curso = $2::catalog_course_tipo AND e.nivel = $3
      ORDER BY e.unidad, e.intento`,
    [childPersonId, curso, nivel],
    client,
  );
}

const aRegistrada = (e: FilaEntrega): EntregaRegistrada => ({
  submissionId: e.submissionId,
  unidad: e.unidad,
  intento: e.intento,
  decision: e.decision,
  aprobada: e.decision === "approved" && puntajesAprueban(e.puntajes ?? []),
});

/** Entregas permitidas por unidad: 3, o el máximo que autorizó el guía. */
async function limitesDe(
  childPersonId: string,
  curso: string,
  nivel: string,
  client?: Q,
): Promise<(unidad: number) => number> {
  const filas = await queryRows<{ unidad: number; maximo: number }>(
    `SELECT unidad, max(max_entregas)::int AS maximo FROM catalog_proyecto_autorizacion
      WHERE child_person_id = $1 AND curso = $2::catalog_course_tipo AND nivel = $3
      GROUP BY unidad`,
    [childPersonId, curso, nivel],
    client,
  );
  const m = new Map(filas.map((f) => [f.unidad, f.maximo]));
  return (u) => Math.max(ENTREGAS_BASE, m.get(u) ?? ENTREGAS_BASE);
}

async function estadoGuardado(
  childPersonId: string,
  curso: string,
  nivel: string,
  client?: Q,
): Promise<Map<string, { valor: string; actualizadoEn: Date }>> {
  const filas = await queryRows<{ clave: string; valor: string; actualizadoEn: Date }>(
    `SELECT clave, valor, actualizado_en AS "actualizadoEn" FROM ${ESTADO}
      WHERE child_person_id = $1 AND curso = $2::catalog_course_tipo AND nivel = $3`,
    [childPersonId, curso, nivel],
    client,
  );
  return new Map(filas.map((f) => [f.clave, { valor: f.valor, actualizadoEn: f.actualizadoEn }]));
}

export interface DatosLibroAlumno {
  /** Claves que la plataforma IMPONE al abrir (pisan lo que haya en el dispositivo). */
  inyectar: Record<string, string>;
  /** Avance guardado en el servidor: se usa si el dispositivo no lo tiene (otra tableta). */
  restaurar: Record<string, string>;
  /** Claves que el libro no puede escribir (el puente las ignora). */
  soloLectura: string[];
  /** Sin identidad válida el libro deja leer pero no entregar. */
  conIdentidad: boolean;
}

/**
 * Lo que el libro de ESTE nivel recibe al abrirse. Las entregas que se le
 * devuelven son las REGISTRADAS: una que el servidor no aceptó no aparece,
 * así el libro y la plataforma cuentan las mismas oportunidades.
 */
export async function datosLibroParaAlumno(
  childPersonId: string,
  curso: string,
  nivel: string,
  client?: Q,
): Promise<DatosLibroAlumno> {
  const k = clavesLibro(nivel);
  const soloLectura = clavesSoloLectura(nivel);
  const alumno = await alumnoDeNino(childPersonId, client);
  const estado = await estadoGuardado(childPersonId, curso, nivel, client);
  const restaurar: Record<string, string> = {};
  for (const clave of [k.progreso, k.practica]) {
    const v = estado.get(clave);
    if (v !== undefined) restaurar[clave] = v.valor;
  }
  if (alumno === null) return { inyectar: {}, restaurar, soloLectura, conIdentidad: false };

  const entregas = await entregasDe(childPersonId, curso, nivel, client);
  const revisiones = await queryRows<{
    unit: number;
    submissionId: string;
    decision: DecisionProyecto;
    puntajes: number[];
    comentario: string;
    revisadoPor: string;
    revisadoEn: Date;
  }>(
    `SELECT e.unidad AS unit, e.submission_id AS "submissionId", r.decision, r.puntajes,
            r.comentario, r.revisado_por AS "revisadoPor", r.revisado_en AS "revisadoEn"
       FROM catalog_proyecto_revision r
       JOIN catalog_proyecto_entrega e ON e.id = r.entrega_id
      WHERE e.child_person_id = $1 AND e.curso = $2::catalog_course_tipo AND e.nivel = $3
      ORDER BY r.revisado_en, r.id`,
    [childPersonId, curso, nivel],
    client,
  );
  const autorizaciones = await queryRows<{
    unidad: number;
    maximo: number;
    autorizadoPor: string;
    autorizadoEn: Date;
  }>(
    `SELECT unidad, max_entregas AS maximo, autorizado_por AS "autorizadoPor",
            autorizado_en AS "autorizadoEn"
       FROM catalog_proyecto_autorizacion
      WHERE child_person_id = $1 AND curso = $2::catalog_course_tipo AND nivel = $3
      ORDER BY autorizado_en, id`,
    [childPersonId, curso, nivel],
    client,
  );
  const borradores = leerProyectosLibro(
    estado.get(k.proyectos)?.valor,
    curso,
    nivel,
    alumno.id,
  ).borradores;
  const contexto = contextoAlumno(curso, nivel, alumno);
  const inyectar: Record<string, string> = {
    [CLAVE_CONTEXTO_ALUMNO]: contexto,
    [k.proyectos]: proyectosParaLibro({
      curso,
      nivel,
      alumnoId: alumno.id,
      borradores,
      entregas: entregas.map((e): EntregaLibro => ({
        submission_id: e.submissionId,
        unit: e.unidad,
        attempt: e.intento,
        text: e.texto,
        submitted_at: e.enviadoEn ?? e.recibidoEn.toISOString(),
      })),
    }),
    [k.revisiones]: revisionesParaLibro({
      curso,
      nivel,
      alumnoId: alumno.id,
      revisiones: revisiones.map((r) => ({
        unit: r.unit,
        submission_id: r.submissionId,
        decision: r.decision,
        scores: r.puntajes,
        feedback: r.comentario,
        reviewed_by: r.revisadoPor,
        reviewed_at: r.revisadoEn.toISOString(),
      })),
      autorizaciones: autorizaciones.map((a) => ({
        unit: a.unidad,
        max_submissions: a.maximo,
        authorized_by: a.autorizadoPor,
        authorized_at: a.autorizadoEn.toISOString(),
      })),
    }),
  };
  // Champion, Elite y Legendary siguen leyendo su clave de pasaporte con la
  // MISMA identidad. Rookie emite su pasaporte con otro mecanismo
  // (`setPassportContext`, contexto verificado), que no se toca.
  if (nivel.toUpperCase() !== "ROOKIE") inyectar[k.pasaporte] = contexto;
  return { inyectar, restaurar, soloLectura, conIdentidad: true };
}

export interface ResultadoSincronizacion extends DatosLibroAlumno {
  registradas: number;
  rechazadas: { submission_id: string; motivo: string }[];
}

/**
 * Lo que el libro guardó, tal como llega del panel del niño. Solo se toman las
 * claves de ESTE nivel que el libro puede escribir; las de solo lectura
 * (identidad, revisiones) se descartan aunque vengan.
 *
 * Todo en una transacción con candado por niño y nivel: dos pestañas del mismo
 * libro que sincronizan a la vez no registran dos veces la misma oportunidad.
 */
export async function sincronizarLibroAlumno(input: {
  childPersonId: string;
  curso: string;
  nivel: string;
  datos: Record<string, string>;
  ip?: string | null;
}): Promise<ResultadoSincronizacion> {
  const { childPersonId, curso, nivel } = input;
  const permitidas = new Set(clavesQueGuarda(nivel));
  const k = clavesLibro(nivel);
  const abiertas = new Set(await misionesAutorizadas(childPersonId, curso, nivel));

  const resultado = await withTransaction(async (tx) => {
    await execute(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`libro:${childPersonId}:${curso}:${nivel}`],
      tx,
    );
    for (const [clave, valor] of Object.entries(input.datos)) {
      if (!permitidas.has(clave) || typeof valor !== "string" || valor.length > TOPE_VALOR)
        continue;
      await execute(
        `INSERT INTO ${ESTADO} (child_person_id, curso, nivel, clave, valor)
         VALUES ($1, $2::catalog_course_tipo, $3, $4, $5)
         ON CONFLICT (child_person_id, curso, nivel, clave)
         DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()
          WHERE ${ESTADO}.valor IS DISTINCT FROM EXCLUDED.valor`,
        [childPersonId, curso, nivel, clave, valor],
        tx,
      );
    }

    const alumno = await alumnoDeNino(childPersonId, tx);
    let registradas: EntregaLibro[] = [];
    let rechazadas: { submission_id: string; motivo: string }[] = [];
    const enviado = input.datos[k.proyectos];
    if (alumno !== null && enviado !== undefined) {
      const { entregas } = leerProyectosLibro(enviado, curso, nivel, alumno.id);
      const previas = (await entregasDe(childPersonId, curso, nivel, tx)).map(aRegistrada);
      const limite = await limitesDe(childPersonId, curso, nivel, tx);
      const plan = planificarEntregas({
        enviadas: entregas,
        registradas: previas,
        limite,
        unidadAbierta: (u) => abiertas.has(u),
      });
      for (const e of plan.aRegistrar) {
        await execute(
          `INSERT INTO catalog_proyecto_entrega
             (id, child_person_id, curso, nivel, unidad, intento, submission_id, texto, enviado_en)
           VALUES ($1, $2, $3::catalog_course_tipo, $4, $5, $6, $7, $8, $9)`,
          [
            newId(),
            childPersonId,
            curso,
            nivel,
            e.unit,
            e.attempt,
            e.submission_id,
            e.text.trim(),
            e.submitted_at.slice(0, 40),
          ],
          tx,
        );
      }
      registradas = plan.aRegistrar;
      rechazadas = plan.rechazadas;
    }
    return {
      registradas,
      rechazadas,
      datos: await datosLibroParaAlumno(childPersonId, curso, nivel, tx),
    };
  });

  for (const e of resultado.registradas) {
    await registrarAuditoria({
      accion: "catalog.proyecto_entregado",
      entidad: "people_person",
      entidadId: childPersonId,
      payload: { curso, nivel, unidad: e.unit, intento: e.attempt, submissionId: e.submission_id },
      ip: input.ip ?? null,
    });
  }
  if (resultado.rechazadas.length > 0) {
    await registrarAuditoria({
      accion: "catalog.proyecto_rechazado",
      entidad: "people_person",
      entidadId: childPersonId,
      payload: { curso, nivel, rechazadas: resultado.rechazadas },
      ip: input.ip ?? null,
    });
  }
  return {
    ...resultado.datos,
    registradas: resultado.registradas.length,
    rechazadas: resultado.rechazadas,
  };
}

/**
 * ¿Es un niño de los salones de este guía? Mismo criterio que pasar lista: su
 * matrícula ACTIVA está en un salón cuyo guía es el actor. Coordinación
 * (`salones.gestionar`) ve a todos.
 */
export async function exigirNinoDelGuia(
  childPersonId: string,
  actor: { userId: string; puedeGestionarCualquierSalon: boolean },
): Promise<void> {
  if (actor.puedeGestionarCualquierSalon) return;
  const fila = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM enrollment_enrollment e
         JOIN scheduling_classroom cl ON cl.id = e.classroom_id
        WHERE e.child_person_id = $1 AND e.estado = 'ACTIVA' AND cl.guia_user_id = $2
     ) AS ok`,
    [childPersonId, actor.userId],
  );
  if (fila?.ok !== true) {
    throw new ForbiddenError("Solo puedes ver y revisar a los alumnos de tus salones.");
  }
}

/** De quién es una entrega (para comprobar el alcance ANTES de revisarla). */
export async function duenoDeEntrega(
  entregaId: string,
): Promise<{ childPersonId: string; curso: string; nivel: string } | null> {
  return queryOne(
    `SELECT child_person_id AS "childPersonId", curso::text AS curso, nivel
       FROM catalog_proyecto_entrega WHERE id = $1`,
    [entregaId],
  );
}

/**
 * El guía revisa una entrega. Solo la ÚLTIMA de su unidad: el libro no lee una
 * revisión de una versión anterior. Se puede volver a revisar (prevalece la
 * última), pero una decisión `approved` que no alcanza el puntaje se rechaza.
 */
export async function revisarProyecto(input: {
  actorUserId: string;
  entregaId: string;
  decision: string;
  puntajes: number[];
  comentario?: string | null;
  ip?: string | null;
}): Promise<{ aprobada: boolean }> {
  const problema = problemaRevision({ decision: input.decision, puntajes: input.puntajes });
  if (problema !== null) throw new ValidationError(problema);
  const comentario = (input.comentario ?? "").trim();
  if (comentario.length > TOPE_COMENTARIO) {
    throw new ValidationError(
      `Las observaciones admiten hasta ${String(TOPE_COMENTARIO)} caracteres.`,
    );
  }
  const entrega = await queryOne<{
    childPersonId: string;
    curso: string;
    nivel: string;
    unidad: number;
    intento: number;
    ultimo: number;
  }>(
    `SELECT e.child_person_id AS "childPersonId", e.curso::text AS curso, e.nivel, e.unidad,
            e.intento,
            (SELECT max(x.intento) FROM catalog_proyecto_entrega x
              WHERE x.child_person_id = e.child_person_id AND x.curso = e.curso
                AND x.nivel = e.nivel AND x.unidad = e.unidad)::int AS ultimo
       FROM catalog_proyecto_entrega e WHERE e.id = $1`,
    [input.entregaId],
  );
  if (entrega === null) throw new NotFoundError("La entrega no existe.");
  if (entrega.intento !== entrega.ultimo) {
    throw new ValidationError("Solo se revisa la última entrega de la unidad.");
  }
  await execute(
    `INSERT INTO catalog_proyecto_revision (id, entrega_id, decision, puntajes, comentario, revisado_por)
     VALUES ($1, $2, $3, $4::smallint[], $5, $6)`,
    [newId(), input.entregaId, input.decision, input.puntajes, comentario, input.actorUserId],
  );
  const aprobada = input.decision === "approved";
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.proyecto_revisado",
    entidad: "people_person",
    entidadId: entrega.childPersonId,
    payload: {
      curso: entrega.curso,
      nivel: entrega.nivel,
      unidad: entrega.unidad,
      intento: entrega.intento,
      decision: input.decision,
      puntajes: input.puntajes,
    },
    ip: input.ip ?? null,
  });
  return { aprobada };
}

/**
 * Otra oportunidad de entrega: `maximo` es el TOTAL permitido (4 = una cuarta).
 * Tiene que superar el límite vigente; bajarlo no tiene sentido y el libro
 * tomaría igual el mayor.
 */
export async function autorizarEntregaExtra(input: {
  actorUserId: string;
  childPersonId: string;
  curso: string;
  nivel: string;
  unidad: number;
  maximo: number;
  ip?: string | null;
}): Promise<{ maximo: number }> {
  if (!(UNIDADES_PROYECTO as readonly number[]).includes(input.unidad)) {
    throw new ValidationError("Unidad sin proyecto.");
  }
  const limite = (await limitesDe(input.childPersonId, input.curso, input.nivel))(input.unidad);
  if (!Number.isInteger(input.maximo) || input.maximo <= limite || input.maximo > ENTREGAS_TOPE) {
    throw new ValidationError(
      `El nuevo total debe ser mayor que ${String(limite)} y de hasta ${String(ENTREGAS_TOPE)}.`,
    );
  }
  await execute(
    `INSERT INTO catalog_proyecto_autorizacion
       (id, child_person_id, curso, nivel, unidad, max_entregas, autorizado_por)
     VALUES ($1, $2, $3::catalog_course_tipo, $4, $5, $6, $7)`,
    [
      newId(),
      input.childPersonId,
      input.curso,
      input.nivel,
      input.unidad,
      input.maximo,
      input.actorUserId,
    ],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.proyecto_entrega_autorizada",
    entidad: "people_person",
    entidadId: input.childPersonId,
    payload: { curso: input.curso, nivel: input.nivel, unidad: input.unidad, maximo: input.maximo },
    ip: input.ip ?? null,
  });
  return { maximo: input.maximo };
}

export type EstadoProyecto = "not_submitted" | "pending_review" | "changes_requested" | "approved";

export interface ProyectoUnidad {
  unidad: number;
  estado: EstadoProyecto;
  limite: number;
  /** Escribiendo una versión que aún no entregó. */
  conBorrador: boolean;
  entregas: {
    id: string;
    intento: number;
    texto: string;
    enviadoEn: string | null;
    recibidoEn: string;
    revisiones: {
      decision: DecisionProyecto;
      puntajes: number[];
      comentario: string;
      revisadoPor: string;
      revisadoEn: string;
    }[];
  }[];
}

export interface LibroDeNino {
  curso: string;
  nivel: string;
  /** Cuándo llegó por última vez algo de este libro (null = nunca lo abrió). */
  actualizadoEn: string | null;
  evaluaciones: UnidadLibro[];
  proyectos: ProyectoUnidad[];
}

/** Estado de un proyecto según su ÚLTIMA entrega y la última revisión de esa entrega. */
function estadoDe(ultima: FilaEntrega | undefined): EstadoProyecto {
  if (ultima === undefined) return "not_submitted";
  if (ultima.decision === null) return "pending_review";
  return aRegistrada(ultima).aprobada ? "approved" : "changes_requested";
}

/** El libro de un niño en un nivel, para el guía: lo que reportó y sus proyectos. */
export async function libroDeNino(
  childPersonId: string,
  curso: string,
  nivel: string,
): Promise<LibroDeNino> {
  const k = clavesLibro(nivel);
  const [estado, entregas, limite, revisiones, alumno] = await Promise.all([
    estadoGuardado(childPersonId, curso, nivel),
    entregasDe(childPersonId, curso, nivel),
    limitesDe(childPersonId, curso, nivel),
    queryRows<{
      entregaId: string;
      decision: DecisionProyecto;
      puntajes: number[];
      comentario: string;
      revisadoPor: string;
      revisadoEn: Date;
    }>(
      `SELECT r.entrega_id AS "entregaId", r.decision, r.puntajes, r.comentario,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', g.nombres, g.apellidos)), ''),
                       NULLIF(TRIM(CONCAT_WS(' ', pf.nombres, pf.apellidos)), ''),
                       u.username) AS "revisadoPor",
              r.revisado_en AS "revisadoEn"
         FROM catalog_proyecto_revision r
         JOIN catalog_proyecto_entrega e ON e.id = r.entrega_id
         JOIN identity_user u ON u.id = r.revisado_por
         LEFT JOIN scheduling_guia g ON g.guia_user_id = u.id
         LEFT JOIN identity_perfil pf ON pf.user_id = u.id
        WHERE e.child_person_id = $1 AND e.curso = $2::catalog_course_tipo AND e.nivel = $3
        ORDER BY r.revisado_en, r.id`,
      [childPersonId, curso, nivel],
    ),
    alumnoDeNino(childPersonId),
  ]);
  const borradores =
    alumno === null
      ? {}
      : leerProyectosLibro(estado.get(k.proyectos)?.valor, curso, nivel, alumno.id).borradores;
  const fechas = [...estado.values()].map((v) => v.actualizadoEn.getTime());
  return {
    curso,
    nivel,
    actualizadoEn: fechas.length > 0 ? new Date(Math.max(...fechas)).toISOString() : null,
    evaluaciones: resumenEvaluacionesLibro(estado.get(k.progreso)?.valor),
    proyectos: UNIDADES_PROYECTO.map((u) => {
      const propias = entregas.filter((e) => e.unidad === u);
      return {
        unidad: u,
        estado: estadoDe(propias.at(-1)),
        limite: limite(u),
        conBorrador: (borradores[String(u)] ?? "").trim() !== "",
        entregas: propias.map((e) => ({
          id: e.id,
          intento: e.intento,
          texto: e.texto,
          enviadoEn: e.enviadoEn,
          recibidoEn: e.recibidoEn.toISOString(),
          revisiones: revisiones
            .filter((r) => r.entregaId === e.id)
            .map((r) => ({
              decision: r.decision,
              puntajes: r.puntajes,
              comentario: r.comentario,
              revisadoPor: r.revisadoPor,
              revisadoEn: r.revisadoEn.toISOString(),
            })),
        })),
      };
    }),
  };
}

/** En qué niveles hay algo del libro de este niño (para elegir cuál ver). */
export async function nivelesConLibro(childPersonId: string): Promise<string[]> {
  const filas = await queryRows<{ nivel: string }>(
    `SELECT nivel FROM ${ESTADO} WHERE child_person_id = $1
     UNION SELECT nivel FROM catalog_proyecto_entrega WHERE child_person_id = $1`,
    [childPersonId],
  );
  return filas.map((f) => f.nivel);
}
