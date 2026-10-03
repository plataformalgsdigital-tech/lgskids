import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import {
  deleteUbicacion,
  getCursoActivoTx,
  getNivelParaUbicar,
  upsertUbicacion,
} from "../infrastructure/progression-repository";
import { recalcularProgresion } from "./recalcular";

/**
 * UBICACIÓN ACADÉMICA: el punto de partida del niño en su curso (nivel +
 * lecciones dadas por cursadas), decidido por coordinación.
 *
 * NO edita el avance (regla 4): guarda una ENTRADA que la función central lee
 * al derivar. Los niveles anteriores quedan completados por convalidación
 * (sin medalla) y el nivel elegido arranca con esas lecciones. Es un piso:
 * nunca resta lo que el niño ya aprobó.
 *
 * Ubicar en el primer nivel con 0 lecciones es "empezar desde el Welcome": se
 * BORRA la ubicación, porque es exactamente lo que la derivación hace sola.
 */
export interface DatosUbicacion {
  childPersonId: string;
  levelId: string;
  lecciones: number;
  motivo: string;
  actorUserId: string;
}

/**
 * Dentro de una transacción ajena: la usa también el cambio de curso, que
 * mueve la matrícula y ubica al niño en el curso nuevo en UN solo paso.
 * El curso lo pone el NIVEL, y tiene que ser el de la matrícula activa del niño
 * (leída en la misma transacción, así ve la matrícula recién movida).
 */
export async function ubicarTx(
  tx: Pick<PoolClient, "query">,
  input: DatosUbicacion,
): Promise<{ courseId: string; nivel: string; lecciones: number; borrada: boolean }> {
  if (input.motivo.trim().length < 5) {
    throw new ValidationError("El motivo del ajuste es obligatorio (mínimo 5 caracteres).");
  }
  const nivel = await getNivelParaUbicar(input.levelId, tx);
  if (nivel === null) throw new NotFoundError("El nivel no existe.");
  if (!Number.isInteger(input.lecciones) || input.lecciones < 0) {
    throw new ValidationError("Las lecciones tienen que ser un número entero desde 0.");
  }
  if (input.lecciones > nivel.totalPracticas) {
    throw new ValidationError(
      `${nivel.nombre} tiene ${String(nivel.totalPracticas)} lecciones: no se pueden dar por cursadas ${String(input.lecciones)}.`,
    );
  }
  const cursoActivo = await getCursoActivoTx(input.childPersonId, tx);
  if (cursoActivo === null) {
    throw new ConflictError("El niño no tiene matrícula activa: no hay curso en el que ubicarlo.");
  }
  if (cursoActivo !== nivel.courseId) {
    throw new ValidationError("El nivel no es del curso en que está matriculado el niño.");
  }

  const borrada = nivel.esPrimero && input.lecciones === 0;
  if (borrada) {
    await deleteUbicacion(tx, input.childPersonId, nivel.courseId);
  } else {
    await upsertUbicacion(tx, {
      childPersonId: input.childPersonId,
      courseId: nivel.courseId,
      levelId: nivel.levelId,
      lecciones: input.lecciones,
      motivo: input.motivo.trim(),
      ubicadoPor: input.actorUserId,
    });
  }
  return { courseId: nivel.courseId, nivel: nivel.nombre, lecciones: input.lecciones, borrada };
}

/**
 * ACADEMIC CHANGE › AJUSTE: ubica al niño en otro nivel y/o lección de su
 * MISMO curso y salón. Re-deriva el avance en el acto.
 */
export async function ubicarNino(
  input: DatosUbicacion & { ip?: string | null },
): Promise<{ nivelActual: string | null }> {
  const r = await withTransaction((tx) => ubicarTx(tx, input));
  // CAMINO 4 de LA FUNCIÓN CENTRAL: la ubicación es una entrada de la
  // derivación, así que el avance se recalcula en el momento.
  const progreso = await recalcularProgresion(input.childPersonId);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "progression.ubicacion",
    entidad: "people_person",
    entidadId: input.childPersonId,
    payload: {
      nivel: r.nivel,
      lecciones: r.lecciones,
      courseId: r.courseId,
      borrada: r.borrada,
      motivo: input.motivo.trim(),
    },
    ip: input.ip ?? null,
  });
  return { nivelActual: progreso?.nivelActual ?? null };
}
