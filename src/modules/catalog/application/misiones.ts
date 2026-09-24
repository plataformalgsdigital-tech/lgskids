import { registrarAuditoria } from "@/modules/audit";
import { matriculaDeNino } from "@/modules/enrollment";
import { progresoDeNino } from "@/modules/progression";
import { execute, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { valorAutorizacionesLibro } from "../domain/libro-interactivo";
import { caminoAbierto, etiquetaParada, paradaValida } from "../domain/unidad-mapa";

/**
 * MISIONES AUTORIZADAS: qué unidad puede abrir cada niño.
 *
 * El libro interactivo abría sus unidades con sus propias reglas. Desde
 * 2026-09-23 manda el GUÍA: abre en clase la misión de la unidad que están
 * trabajando —evaluación, juego y souvenir— para los niños de su sesión.
 *
 * Es un PERMISO, no progresión (regla 4): nadie lo deriva de evaluaciones y no
 * mueve medallas. Vive aquí, en `catalog`, porque decide acceso a CONTENIDO;
 * quién lo concede (un guía, desde una sesión) es cosa de la ruta.
 */

export interface NivelDeNino {
  curso: string;
  /** El nivel que está trabajando. */
  actual: string;
  /** El actual y los ya completados, en orden de currículo. */
  alcanzados: string[];
}

/**
 * Curso y nivel de un niño. MISMO criterio que el dashboard y el material —
 * el EN_CURSO, si no el primero sin completar—, en un solo lugar para que las
 * tres pantallas no discrepen.
 */
export async function nivelDeNino(childPersonId: string): Promise<NivelDeNino | null> {
  const matricula = await matriculaDeNino(childPersonId);
  if (matricula === null) return null;

  const progreso = await progresoDeNino(childPersonId);
  const actual =
    (
      progreso.niveles.find((n) => n.estado === "EN_CURSO") ??
      progreso.niveles.find((n) => n.estado !== "COMPLETADO") ??
      progreso.niveles[0]
    )?.codigo ?? "ROOKIE";

  // `niveles` viene en orden de currículo: el corte es posicional.
  const iActual = progreso.niveles.findIndex((n) => n.codigo === actual);
  const alcanzados = (
    iActual >= 0 ? progreso.niveles.slice(0, iActual + 1) : progreso.niveles.slice(0, 1)
  ).map((n) => n.codigo);

  return { curso: matricula.tipoCurso, actual, alcanzados };
}

export interface MisionAutorizada {
  childPersonId: string;
  curso: string;
  nivel: string;
  parada: number;
  autorizadoEn: string;
  /** Usuario del guía o coordinador que la abrió. */
  autorizadoPor: string | null;
}

/** Lo que el guía abrió EXPLÍCITAMENTE, tal cual está en la tabla. */
async function paradasAutorizadas(
  childPersonId: string,
  curso: string,
  nivel: string,
): Promise<number[]> {
  const filas = await queryRows<{ parada: number }>(
    `SELECT parada FROM catalog_mision_autorizada
      WHERE child_person_id = $1 AND curso = $2::catalog_course_tipo AND nivel = $3
      ORDER BY parada`,
    [childPersonId, curso, nivel],
  );
  return filas.map((f) => f.parada);
}

/**
 * Lo que el niño tiene ABIERTO en ese nivel: el Welcome y todas las unidades
 * hasta la más alta que le abrieron (`caminoAbierto`).
 *
 * No es lo mismo que las filas de la tabla, y esa es la gracia: el guía abre
 * en clase la unidad que están trabajando, y el niño que va en la 3 conserva
 * el libro y el cuaderno de la 1 y la 2 sin que nadie tenga que abrírselos de
 * a una. Quien pregunte "¿puede ver esto?" llama AQUÍ.
 */
export async function misionesAutorizadas(
  childPersonId: string,
  curso: string,
  nivel: string,
): Promise<number[]> {
  return caminoAbierto(await paradasAutorizadas(childPersonId, curso, nivel));
}

/** Lo abierto a varios niños (la lista de una sesión), para pintarlo de una vez. */
export async function misionesDeNinos(childPersonIds: string[]): Promise<MisionAutorizada[]> {
  if (childPersonIds.length === 0) return [];
  return queryRows<MisionAutorizada>(
    `SELECT m.child_person_id AS "childPersonId", m.curso::text AS curso, m.nivel, m.parada,
            m.autorizado_en::text AS "autorizadoEn", u.username AS "autorizadoPor"
       FROM catalog_mision_autorizada m
       LEFT JOIN identity_user u ON u.id = m.autorizado_por
      WHERE m.child_person_id = ANY($1::uuid[])
      ORDER BY m.nivel, m.parada`,
    [childPersonIds],
  );
}

export interface ResultadoAutorizacion {
  childPersonId: string;
  /** Null cuando el niño no tiene matrícula activa: no se le pudo abrir nada. */
  nivel: string | null;
  /** Ya la tenía abierta: autorizar de nuevo no duplica ni cambia quién la abrió. */
  yaEstaba: boolean;
}

/**
 * Abre una parada a varios niños.
 *
 * El NIVEL importa: el libro es uno por nivel, y abrir la Unidad 1 de Champion
 * no abre nada en el libro de Rookie. Por eso el guía elige el nivel que está
 * trabajando la CLASE; si no lo manda, se usa el que cada niño tiene en curso
 * (el del grupo, salvo que alguno vaya por detrás).
 */
export async function autorizarMisiones(input: {
  actorUserId: string;
  childPersonIds: string[];
  parada: number;
  /** Nivel de la clase; si falta, el que cada niño está trabajando. */
  nivel?: string | null;
  sessionId?: string | null;
  ip?: string | null;
}): Promise<ResultadoAutorizacion[]> {
  if (!paradaValida(input.parada)) {
    throw new ValidationError("Esa unidad no existe en el mapa del nivel.");
  }
  if (input.childPersonIds.length === 0) {
    throw new ValidationError("Elige al menos un niño.");
  }

  const niveles = await Promise.all(
    input.childPersonIds.map(async (id) => ({ id, nivel: await nivelDeNino(id) })),
  );

  const resultados = await withTransaction(async (tx) => {
    const salida: ResultadoAutorizacion[] = [];
    for (const { id, nivel } of niveles) {
      if (nivel === null) {
        salida.push({ childPersonId: id, nivel: null, yaEstaba: false });
        continue;
      }
      const elNivel = input.nivel ?? nivel.actual;
      const insertadas = await execute(
        `INSERT INTO catalog_mision_autorizada
           (id, child_person_id, curso, nivel, parada, session_id, autorizado_por)
         VALUES ($1, $2, $3::catalog_course_tipo, $4, $5, $6, $7)
         ON CONFLICT (child_person_id, curso, nivel, parada) DO NOTHING`,
        [
          newId(),
          id,
          nivel.curso,
          elNivel,
          input.parada,
          input.sessionId ?? null,
          input.actorUserId,
        ],
        tx,
      );
      salida.push({ childPersonId: id, nivel: elNivel, yaEstaba: insertadas === 0 });
    }
    return salida;
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.misiones_autorizadas",
    entidad: "scheduling_session",
    entidadId: input.sessionId ?? null,
    payload: {
      parada: input.parada,
      etiqueta: etiquetaParada(input.parada),
      nivel: input.nivel ?? "(el de cada niño)",
      abiertas: resultados.filter((r) => r.nivel !== null && !r.yaEstaba).length,
      ninos: resultados.map((r) => r.childPersonId),
    },
    ip: input.ip ?? null,
  });
  return resultados;
}

/** Cierra una parada que se abrió por error. El niño deja de verla en el libro. */
export async function revocarMision(input: {
  actorUserId: string;
  childPersonId: string;
  curso: string;
  nivel: string;
  parada: number;
  ip?: string | null;
}): Promise<void> {
  await execute(
    `DELETE FROM catalog_mision_autorizada
      WHERE child_person_id = $1 AND curso = $2::catalog_course_tipo
        AND nivel = $3 AND parada = $4`,
    [input.childPersonId, input.curso, input.nivel, input.parada],
  );
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.mision_revocada",
    entidad: "people_person",
    entidadId: input.childPersonId,
    payload: { curso: input.curso, nivel: input.nivel, parada: input.parada },
    ip: input.ip ?? null,
  });
}

/**
 * Lo que el LIBRO lee para saber qué unidades abrir. Se arma aquí y viaja
 * hecho: el panel no copia el formato (ver `domain/libro-interactivo.ts`).
 */
export async function autorizacionParaLibro(
  childPersonId: string,
  curso: string,
  nivel: string,
): Promise<string> {
  return valorAutorizacionesLibro(await misionesAutorizadas(childPersonId, curso, nivel));
}
