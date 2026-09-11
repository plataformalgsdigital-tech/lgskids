import { registrarAuditoria } from "@/modules/audit";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";
import { UNIDADES_POR_NIVEL } from "./imagen-curso";

/**
 * Enlaces de JUEGOS por unidad.
 *
 * Van atados a (curso, nivel, unidad 1..4) —no a la lección— porque lo que el
 * niño toca es la unidad en el mapa de la isla: ahí se le abre la lámina de la
 * unidad y, con ella, sus juegos.
 *
 * La unidad se identifica por NÚMERO, el mismo que marcan los hotspots. En
 * `catalog_curso` la unidad es texto libre y trae de todo ("Unidad 0",
 * "Repaso 3", erratas incluidas); colgar de ahí la clave la haría frágil.
 *
 * No hay tope de juegos: son un puñado por unidad y siempre se leen enteros.
 */

export interface Juego {
  nombre: string;
  enlace: string;
  /**
   * Posición sobre la LÁMINA, en % de la imagen (como los hotspots del mapa).
   * Opcional: sin ella el juego solo sale en la lista de abajo. Van juntas o
   * ninguna — media coordenada no ubica nada.
   */
  x?: number;
  y?: number;
}

export interface JuegosUnidad {
  curso: string;
  nivel: string;
  unidad: number;
  juegos: Juego[];
}

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const NIVELES_CODIGO = NIVELES.map((n) => n.codigo) as readonly string[];

function exigirClave(curso: string, nivel: string, unidad: number): void {
  if (!CURSOS.includes(curso)) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (!NIVELES_CODIGO.includes(nivel)) throw new ValidationError(`Nivel inválido: ${nivel}.`);
  if (!Number.isInteger(unidad) || unidad < 1 || unidad > UNIDADES_POR_NIVEL) {
    throw new ValidationError(
      `Unidad inválida: ${String(unidad)} (1 a ${String(UNIDADES_POR_NIVEL)}).`,
    );
  }
}

/**
 * Normaliza la lista: descarta las filas vacías y exige que el enlace sea una
 * URL http(s). Un enlace roto en el panel del niño es peor que no tenerlo.
 */
function limpiar(juegos: Juego[]): Juego[] {
  const salida: Juego[] = [];
  for (const j of juegos) {
    const nombre = (j.nombre ?? "").trim();
    const enlace = (j.enlace ?? "").trim();
    if (nombre === "" && enlace === "") continue;
    if (nombre === "") throw new ValidationError("Cada juego necesita un nombre.");
    if (!/^https?:\/\/\S+$/i.test(enlace)) {
      throw new ValidationError(`El enlace de "${nombre}" debe empezar por http:// o https://`);
    }
    const tieneX = typeof j.x === "number";
    const tieneY = typeof j.y === "number";
    if (tieneX !== tieneY) {
      throw new ValidationError(`"${nombre}" tiene media coordenada: hacen falta las dos.`);
    }
    if (tieneX && tieneY) {
      const dentro = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100;
      if (!dentro(j.x as number) || !dentro(j.y as number)) {
        throw new ValidationError(`La posición de "${nombre}" debe estar entre 0 y 100 %.`);
      }
    }
    salida.push({
      nombre: nombre.slice(0, 120),
      enlace: enlace.slice(0, 500),
      // Se redondea a una décima: más precisión no se aprecia y ensucia el JSON.
      ...(tieneX && tieneY
        ? { x: Math.round((j.x as number) * 10) / 10, y: Math.round((j.y as number) * 10) / 10 }
        : {}),
    });
  }
  return salida;
}

/** Juegos de UNA unidad. Devuelve lista vacía si nunca se guardaron. */
export async function juegosDeUnidad(
  curso: string,
  nivel: string,
  unidad: number,
): Promise<Juego[]> {
  exigirClave(curso, nivel, unidad);
  const fila = await queryOne<{ juegos: Juego[] }>(
    `SELECT juegos FROM catalog_unidad_juego
      WHERE curso = $1::catalog_course_tipo AND nivel = $2 AND unidad = $3`,
    [curso, nivel, unidad],
  );
  return fila?.juegos ?? [];
}

/** Juegos de TODAS las unidades de un nivel, para el panel del alumno. */
export async function juegosDeNivel(
  curso: string,
  nivel: string,
): Promise<Record<number, Juego[]>> {
  if (!CURSOS.includes(curso) || !NIVELES_CODIGO.includes(nivel)) return {};
  const filas = await queryRows<{ unidad: number; juegos: Juego[] }>(
    `SELECT unidad, juegos FROM catalog_unidad_juego
      WHERE curso = $1::catalog_course_tipo AND nivel = $2
      ORDER BY unidad`,
    [curso, nivel],
  );
  const mapa: Record<number, Juego[]> = {};
  for (let u = 1; u <= UNIDADES_POR_NIVEL; u++) mapa[u] = [];
  for (const f of filas) mapa[f.unidad] = f.juegos;
  return mapa;
}

/** Reemplaza la lista completa de la unidad (UPSERT). */
export async function guardarJuegosUnidad(input: {
  actorUserId: string;
  curso: string;
  nivel: string;
  unidad: number;
  juegos: Juego[];
  ip?: string | null;
}): Promise<{ juegos: Juego[] }> {
  exigirClave(input.curso, input.nivel, input.unidad);
  const juegos = limpiar(input.juegos);

  await execute(
    `INSERT INTO catalog_unidad_juego (curso, nivel, unidad, juegos, updated_at)
     VALUES ($1::catalog_course_tipo, $2, $3, $4::jsonb, now())
     ON CONFLICT (curso, nivel, unidad)
     DO UPDATE SET juegos = EXCLUDED.juegos, updated_at = now()`,
    [input.curso, input.nivel, input.unidad, JSON.stringify(juegos)],
  );

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.juegos_unidad_guardados",
    entidad: "catalog_unidad_juego",
    entidadId: `${input.curso}:${input.nivel}:${String(input.unidad)}`,
    payload: { cuantos: juegos.length },
    ip: input.ip ?? null,
  });

  return { juegos };
}
