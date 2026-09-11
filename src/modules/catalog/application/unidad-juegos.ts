import { registrarAuditoria } from "@/modules/audit";
import { execute, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ValidationError } from "@/platform/errors";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";
import { UNIDADES_MAPA, unidadMapa } from "../domain/unidad-mapa";

/**
 * JUEGOS de una unidad del mapa.
 *
 * NO son un dato propio: son las **actividades de las lecciones** de esa
 * unidad, las mismas que se cargan en Gestión de Contenido y por CSV. Tenerlas
 * dos veces era pedir que se desincronizaran, así que aquí solo se leen.
 *
 * Lo único que este módulo escribe es la POSICIÓN sobre la lámina (`x`/`y` en
 * % de la imagen), guardada dentro de la propia actividad. Nombre y enlace se
 * siguen editando donde siempre.
 *
 * Qué lección cae en qué casilla lo decide `unidadMapa`: solo "Unidad 1".."4".
 * La "Unidad 0" es la bienvenida y los repasos/evaluaciones no tienen casilla,
 * así que sus actividades existen pero no se abren desde el mapa.
 */

export interface Juego {
  /** Lección de `catalog_curso` de la que sale. */
  cursoRefId: string;
  /** Posición dentro del arreglo `actividades` de esa lección. */
  indice: number;
  leccion: string;
  nombre: string;
  enlace: string;
  /** Posición sobre la lámina, en % de la imagen. Opcional. */
  x?: number;
  y?: number;
}

interface FilaActividad {
  id: string;
  unidad: string | null;
  leccion: string;
  actividades: { nombre?: string; link?: string; enlace?: string; x?: number; y?: number }[] | null;
}

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const NIVELES_CODIGO = NIVELES.map((n) => n.codigo) as readonly string[];

function exigirCursoNivel(curso: string, nivel: string): void {
  if (!CURSOS.includes(curso)) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (!NIVELES_CODIGO.includes(nivel)) throw new ValidationError(`Nivel inválido: ${nivel}.`);
}

async function actividadesDelNivel(curso: string, nivel: string): Promise<FilaActividad[]> {
  return queryRows<FilaActividad>(
    `SELECT id, unidad, leccion, actividades
       FROM catalog_curso
      WHERE curso = $1::catalog_course_tipo AND nivel = $2
        AND actividades IS NOT NULL AND jsonb_array_length(actividades) > 0
      ORDER BY orden, leccion`,
    [curso, nivel],
  );
}

/** Convierte una fila del catálogo en los juegos de su casilla. */
function juegosDeFila(fila: FilaActividad): Juego[] {
  return (fila.actividades ?? []).flatMap((a, indice) => {
    // El CSV guarda `link`; algún editor escribió `enlace`. Se aceptan ambos.
    const enlace = (a.link ?? a.enlace ?? "").trim();
    const nombre = (a.nombre ?? "").trim();
    if (enlace === "" || nombre === "") return [];
    return [
      {
        cursoRefId: fila.id,
        indice,
        leccion: fila.leccion,
        nombre,
        enlace,
        ...(typeof a.x === "number" && typeof a.y === "number" ? { x: a.x, y: a.y } : {}),
      },
    ];
  });
}

/** Juegos de UNA casilla del mapa. */
export async function juegosDeUnidad(
  curso: string,
  nivel: string,
  unidad: number,
): Promise<Juego[]> {
  exigirCursoNivel(curso, nivel);
  if (!Number.isInteger(unidad) || unidad < 1 || unidad > UNIDADES_MAPA) {
    throw new ValidationError(`Unidad inválida: ${String(unidad)} (1 a ${String(UNIDADES_MAPA)}).`);
  }
  const filas = await actividadesDelNivel(curso, nivel);
  return filas.filter((f) => unidadMapa(f.unidad) === unidad).flatMap(juegosDeFila);
}

/** Juegos de TODAS las casillas de un nivel, para el panel del alumno. */
export async function juegosDeNivel(
  curso: string,
  nivel: string,
): Promise<Record<number, Juego[]>> {
  if (!CURSOS.includes(curso) || !NIVELES_CODIGO.includes(nivel)) return {};
  const filas = await actividadesDelNivel(curso, nivel);
  const mapa: Record<number, Juego[]> = {};
  for (let u = 1; u <= UNIDADES_MAPA; u++) mapa[u] = [];
  for (const f of filas) {
    const u = unidadMapa(f.unidad);
    if (u === null) continue;
    mapa[u] = [...(mapa[u] ?? []), ...juegosDeFila(f)];
  }
  return mapa;
}

export interface Posicion {
  cursoRefId: string;
  indice: number;
  /** Sin x/y se QUITA de la lámina y el juego vuelve a la lista. */
  x?: number;
  y?: number;
}

/**
 * Guarda dónde va cada juego sobre la lámina.
 *
 * Solo toca `x`/`y` de la actividad indicada: nombre y enlace se leen y se
 * vuelven a escribir tal cual, para que este editor no pueda estropear lo que
 * se carga en Gestión de Contenido.
 */
export async function guardarPosicionesUnidad(input: {
  actorUserId: string;
  posiciones: Posicion[];
  ip?: string | null;
}): Promise<{ actualizadas: number }> {
  const dentro = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100;
  for (const p of input.posiciones) {
    const tieneX = typeof p.x === "number";
    const tieneY = typeof p.y === "number";
    if (tieneX !== tieneY) {
      throw new ValidationError("Media coordenada no ubica nada: hacen falta las dos.");
    }
    if (tieneX && tieneY && (!dentro(p.x as number) || !dentro(p.y as number))) {
      throw new ValidationError("La posición debe estar entre 0 y 100 %.");
    }
  }

  // Las posiciones de una unidad se guardan juntas: a medio guardar, unos
  // juegos quedarían sobre la lámina y otros no.
  let actualizadas = 0;
  await withTransaction(async (tx) => {
    // Se agrupan por lección para reescribir cada `actividades` una sola vez.
    const porLeccion = new Map<string, Posicion[]>();
    for (const p of input.posiciones) {
      porLeccion.set(p.cursoRefId, [...(porLeccion.get(p.cursoRefId) ?? []), p]);
    }

    for (const [cursoRefId, posiciones] of porLeccion) {
      const filas = await queryRows<FilaActividad>(
        `SELECT id, unidad, leccion, actividades FROM catalog_curso WHERE id = $1 FOR UPDATE`,
        [cursoRefId],
        tx,
      );
      const fila = filas[0];
      if (fila === undefined) throw new ValidationError("La lección ya no existe.");

      const actividades = [...(fila.actividades ?? [])];
      for (const p of posiciones) {
        const a = actividades[p.indice];
        if (a === undefined) {
          throw new ValidationError(
            `La actividad ${String(p.indice + 1)} de "${fila.leccion}" ya no existe: recarga la pantalla.`,
          );
        }
        const copia = { ...a };
        if (typeof p.x === "number" && typeof p.y === "number") {
          copia.x = Math.round(p.x * 10) / 10;
          copia.y = Math.round(p.y * 10) / 10;
        } else {
          delete copia.x;
          delete copia.y;
        }
        actividades[p.indice] = copia;
        actualizadas++;
      }

      await execute(
        `UPDATE catalog_curso SET actividades = $2::jsonb, updated_at = now() WHERE id = $1`,
        [cursoRefId, JSON.stringify(actividades)],
        tx,
      );
    }
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.posiciones_juegos_guardadas",
    entidad: "catalog_curso",
    entidadId: input.posiciones[0]?.cursoRefId ?? null,
    payload: { actualizadas },
    ip: input.ip ?? null,
  });

  return { actualizadas };
}
