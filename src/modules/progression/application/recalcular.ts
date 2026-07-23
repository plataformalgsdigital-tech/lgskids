import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { queryRows } from "@/platform/db/query";
import { logger } from "@/platform/logging/logger";
import {
  getAprobadosDeNino,
  getCursoActivoDeNino,
  getEstructuraCurso,
  ninosActivos,
  otorgarAward,
  tieneAward,
  upsertProgress,
  type EstructuraNivel,
} from "../infrastructure/progression-repository";

/**
 * ══════════════════════════════════════════════════════════════════
 *  LA FUNCIÓN CENTRAL DE PROGRESIÓN (regla dura 4, sección 2.6)
 * ══════════════════════════════════════════════════════════════════
 *
 * Avance por NIVEL: las 4 lecciones completadas (cuestionario de práctica
 * aprobado) + Level Up aprobado ⇒ nivel COMPLETADO ⇒ 🏅 MEDALLA.
 * Los 4 niveles completados ⇒ 🎓 DIPLOMA del curso.
 * NO se cuenta por sesiones asistidas (esa regla era del agendamiento
 * libre de LGS y no aplica a cohortes).
 *
 * PROPIEDADES (las que faltaron en LGS y dejaron alumnos trabados):
 * - DERIVADA: el estado se recalcula completo desde assessment; nada se
 *   edita a mano.
 * - IDEMPOTENTE: recalcular N veces deja el mismo estado; premios se
 *   otorgan una sola vez.
 * - RECUPERABLE: si un camino no la disparó (bug, caída), la siguiente
 *   invocación desde CUALQUIER camino corrige todo, y el worker la corre
 *   de red de seguridad.
 *
 * CAMINOS QUE LA DISPARAN (enumerados y verificados por la prueba
 * caminos-progresion.test.ts — agregar un camino nuevo exige sumarlo ahí):
 *   1. attendance.marcarAsistencia  (individual y masiva: mismo camino)
 *   2. assessment.registrarIntento  (práctica y Level Up)
 *   3. worker "progression.recalculo_global" (red de seguridad periódica)
 */
export async function recalcularProgresion(childPersonId: string): Promise<{
  nivelActual: string | null;
  medallasNuevas: number;
  diplomaNuevo: boolean;
} | null> {
  const curso = await getCursoActivoDeNino(childPersonId);
  if (curso === null) {
    return null; // sin matrícula activa: nada que derivar
  }
  const estructura = await getEstructuraCurso(curso.courseId);
  if (estructura.length === 0) return null;
  const aprobados = await getAprobadosDeNino(childPersonId);

  let medallasNuevas = 0;
  let diplomaNuevo = false;
  let nivelActual: string | null = null;

  await withTransaction(async (tx) => {
    let todosCompletos = true;
    for (const nivel of estructura) {
      const lecciones = nivel.practicaQuizIds.filter((q) => aprobados.has(q)).length;
      const levelUp = nivel.levelUpQuizId !== null && aprobados.has(nivel.levelUpQuizId);
      const completado = lecciones >= nivel.practicaQuizIds.length && levelUp;

      await upsertProgress(tx, {
        childPersonId,
        levelId: nivel.levelId,
        leccionesCompletadas: lecciones,
        levelUpAprobado: levelUp,
        completado,
      });

      if (completado) {
        const yaTiene = await tieneAward(tx, childPersonId, "MEDALLA", nivel.levelId, null);
        if (!yaTiene) {
          await otorgarAward(tx, {
            childPersonId,
            tipo: "MEDALLA",
            levelId: nivel.levelId,
            courseId: null,
          });
          medallasNuevas += 1;
        }
      } else {
        todosCompletos = false;
        if (nivelActual === null) nivelActual = nivel.nombre;
      }
    }

    if (todosCompletos) {
      nivelActual = "EGRESADO";
      const yaDiploma = await tieneAward(tx, childPersonId, "DIPLOMA", null, curso.courseId);
      if (!yaDiploma) {
        await otorgarAward(tx, {
          childPersonId,
          tipo: "DIPLOMA",
          levelId: null,
          courseId: curso.courseId,
        });
        diplomaNuevo = true;
      }
    }
  });

  if (medallasNuevas > 0 || diplomaNuevo) {
    // Fase 10: aquí notifications enviará medalla/diploma por WhatsApp
    // (los awards quedan con notificado_en NULL hasta entonces).
    await registrarAuditoria({
      actorUserId: null,
      accion: diplomaNuevo ? "progression.diploma" : "progression.medalla",
      entidad: "people_person",
      entidadId: childPersonId,
      payload: { medallasNuevas, diplomaNuevo, nivelActual },
    });
  }
  return { nivelActual, medallasNuevas, diplomaNuevo };
}

/**
 * Recalcula a TODOS los niños con matrícula activa (worker, red de
 * seguridad): si algún camino falló en disparar, aquí se corrige solo.
 */
export async function recalculoGlobal(): Promise<number> {
  const ninos = await ninosActivos();
  for (const childPersonId of ninos) {
    try {
      await recalcularProgresion(childPersonId);
    } catch (error) {
      logger.error("Recalculo de progresión falló para un niño", {
        childPersonId,
        error: String(error),
      });
    }
  }
  return ninos.length;
}

export interface ProgresoNino {
  curso: { courseId: string; tipo: string; campania: string } | null;
  niveles: {
    levelId: string;
    codigo: string;
    nombre: string;
    orden: number;
    leccionesCompletadas: number;
    totalLecciones: number;
    levelUpAprobado: boolean;
    estado: "EN_CURSO" | "COMPLETADO" | "PENDIENTE";
    medalla: boolean;
  }[];
  diploma: boolean;
}

/** Vista del progreso del niño (para panel de staff, apoderado y alumno). */
export async function progresoDeNino(childPersonId: string): Promise<ProgresoNino> {
  const curso = await getCursoActivoDeNino(childPersonId);
  if (curso === null) {
    return { curso: null, niveles: [], diploma: false };
  }
  const estructura = await getEstructuraCurso(curso.courseId);

  interface Row {
    level_id: string;
    lecciones: number;
    level_up: boolean;
    estado: string;
    medalla: boolean;
  }
  const rows = await queryRows<Row>(
    `SELECT n.id AS level_id,
            COALESCE(p.lecciones_completadas, 0) AS lecciones,
            COALESCE(p.level_up_aprobado, false) AS level_up,
            COALESCE(p.estado::text, 'PENDIENTE') AS estado,
            EXISTS (
              SELECT 1 FROM progression_award a
               WHERE a.child_person_id = $1 AND a.tipo = 'MEDALLA' AND a.level_id = n.id
            ) AS medalla
       FROM catalog_level n
       LEFT JOIN progression_level_progress p
         ON p.level_id = n.id AND p.child_person_id = $1
      WHERE n.course_id = $2
      ORDER BY n.orden`,
    [childPersonId, curso.courseId],
  );
  const porNivel = new Map(rows.map((r) => [r.level_id, r]));

  const diplomaRows = await queryRows<{ id: string }>(
    `SELECT id FROM progression_award
      WHERE child_person_id = $1 AND tipo = 'DIPLOMA' AND course_id = $2`,
    [childPersonId, curso.courseId],
  );

  return {
    curso,
    niveles: estructura.map((nivel: EstructuraNivel) => {
      const row = porNivel.get(nivel.levelId);
      return {
        levelId: nivel.levelId,
        codigo: nivel.codigo,
        nombre: nivel.nombre,
        orden: nivel.orden,
        leccionesCompletadas: row?.lecciones ?? 0,
        totalLecciones: nivel.practicaQuizIds.length,
        levelUpAprobado: row?.level_up ?? false,
        estado: (row?.estado ?? "PENDIENTE") as "EN_CURSO" | "COMPLETADO" | "PENDIENTE",
        medalla: row?.medalla ?? false,
      };
    }),
    diploma: diplomaRows.length > 0,
  };
}
