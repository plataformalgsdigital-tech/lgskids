import { registrarAuditoria } from "@/modules/audit";
import { queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { newId } from "@/platform/ids";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";
import { PARADAS, paradaValida } from "../domain/unidad-mapa";
import { imagenCursoIdResuelto } from "./imagen-curso";
import { audiosDeLibro, type PistaLibro } from "./libro-audio";

/**
 * LIBRO INTERACTIVO: el cuadernillo impreso como datos.
 *
 * Los elementos de cada página viajan como JSONB porque cada tipo tiene forma
 * propia y seis de los trece aparecen una sola vez (ver la migración
 * `20260911100000_libro_interactivo`). Este módulo NO valida la forma interna
 * de cada elemento: valida lo que hace falta para que el lector no se rompa
 * —que sea una lista, que cada elemento tenga `tipo` e `id`, y que los `id` no
 * se repitan dentro de la página— y deja el resto al editor.
 *
 * La llave de una página es (libro, página). La `parada` es la del mapa de la
 * isla: 0 = Welcome. Un cuadernillo puede cubrir varias.
 */

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const NIVELES_CODIGO = NIVELES.map((n) => n.codigo) as readonly string[];

/** Lo mínimo que el lector necesita para no romperse al pintar. */
export interface ElementoLibro {
  tipo: string;
  id: string;
  [k: string]: unknown;
}

export interface PaginaLibro {
  /** ORDEN de lectura, denso desde 0. Es la llave junto al libro. */
  pagina: number;
  /**
   * El número que el niño ve IMPRESO. Es null en las portadas de cada parada,
   * que ocupan pliego entero y no llevan número. Contarlas como si lo tuvieran
   * fue lo que desalineó el libro entero la primera vez.
   */
  numeroImpreso?: number | null;
  /** Página REAL del PDF de origen. */
  pliego?: number | null;
  /** Si la página es la mitad izquierda, la derecha o el pliego completo. */
  mitad?: "izq" | "der" | "entera" | null;
  parada: number;
  titulo?: string | null;
  elementos: ElementoLibro[];
  /** La página dibujada. Es una CAPA: los elementos van encima o al lado. */
  imagenUrl?: string | null;
  /**
   * Composición por capas del rediseño. Cuando existe MANDA sobre la imagen
   * aplanada, que trae el arte viejo dentro. Así el rediseño avanza página a
   * página sin romper las que ya se leen.
   */
  escena?: Record<string, unknown> | null;
  /**
   * La narración de la página, que sustituye a los globos del impreso.
   *
   * Viene por PLIEGO, así que las dos páginas de una hoja comparten lista
   * hasta que alguien escuche las pistas y las asigne (`elementoId`).
   */
  audios?: { id: string; orden: number; url: string; elementoId: string | null }[];
}

export interface LibroEntrada {
  curso: string;
  nivel: string;
  codigo: string;
  titulo?: string | null;
  fuente?: string | null;
  paginas: PaginaLibro[];
  /** Nombre de la insignia de cada parada que el libro cierra. */
  insignias?: { parada: number; nombre: string }[];
}

function validarClave(curso: string, nivel: string): void {
  if (!CURSOS.includes(curso)) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (!NIVELES_CODIGO.includes(nivel)) throw new ValidationError(`Nivel inválido: ${nivel}.`);
}

/**
 * Comprueba lo que el lector da por hecho.
 *
 * Se revisa TODO antes de escribir nada: un libro a medio importar —unas
 * páginas nuevas y otras viejas— es peor que uno no importado, porque parece
 * que funcionó.
 */
function validarPaginas(paginas: PaginaLibro[]): void {
  if (paginas.length === 0) throw new ValidationError("El libro no trae páginas.");

  const vistas = new Set<number>();
  for (const p of paginas) {
    if (!Number.isInteger(p.pagina) || p.pagina < 0) {
      throw new ValidationError(`Página inválida: ${String(p.pagina)}.`);
    }
    if (vistas.has(p.pagina)) {
      throw new ValidationError(`La página ${String(p.pagina)} viene dos veces.`);
    }
    vistas.add(p.pagina);

    if (!paradaValida(p.parada)) {
      throw new ValidationError(
        `Parada inválida en la página ${String(p.pagina)}: ${String(p.parada)} ` +
          `(válidas: ${PARADAS.join(", ")}; la 0 es el Welcome).`,
      );
    }
    if (!Array.isArray(p.elementos)) {
      throw new ValidationError(`Los elementos de la página ${String(p.pagina)} no son una lista.`);
    }

    // Los `id` son la llave con la que se guarda la respuesta del niño. Dos
    // iguales en una página harían que una pisara a la otra, en silencio.
    const ids = new Set<string>();
    for (const e of p.elementos) {
      if (typeof e?.tipo !== "string" || e.tipo.trim() === "") {
        throw new ValidationError(`Un elemento de la página ${String(p.pagina)} no tiene tipo.`);
      }
      if (typeof e.id !== "string" || e.id.trim() === "") {
        throw new ValidationError(
          `Un elemento «${e.tipo}» de la página ${String(p.pagina)} no tiene id.`,
        );
      }
      if (ids.has(e.id)) {
        throw new ValidationError(
          `El id «${e.id}» se repite en la página ${String(p.pagina)}: la respuesta de uno pisaría la del otro.`,
        );
      }
      ids.add(e.id);
    }
  }
}

/**
 * Importa (o reemplaza) un libro completo, en UNA transacción.
 *
 * Reemplaza sus páginas en bloque: el cuadernillo es la unidad que se edita, y
 * dejar páginas viejas sueltas mezclaría dos versiones del mismo libro.
 */
export async function importarLibro(input: {
  actorUserId: string;
  libro: LibroEntrada;
  ip?: string | null;
}): Promise<{ libroId: string; paginas: number; insignias: number }> {
  const { libro } = input;
  validarClave(libro.curso, libro.nivel);
  if (typeof libro.codigo !== "string" || libro.codigo.trim() === "") {
    throw new ValidationError("El libro necesita un código (por ejemplo «UNIT 0-1»).");
  }
  validarPaginas(libro.paginas);

  for (const i of libro.insignias ?? []) {
    if (!paradaValida(i.parada)) {
      throw new ValidationError(`Insignia con parada inválida: ${String(i.parada)}.`);
    }
    if (typeof i.nombre !== "string" || i.nombre.trim() === "") {
      throw new ValidationError(`La insignia de la parada ${String(i.parada)} no tiene nombre.`);
    }
  }

  return withTransaction(async (client) => {
    const libroId = newId();
    const cab = await client.query<{ id: string }>(
      `INSERT INTO catalog_libro (id, curso, nivel, codigo, titulo, fuente, updated_at)
         VALUES ($1, $2::catalog_course_tipo, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (curso, nivel, codigo) DO UPDATE
         SET titulo = EXCLUDED.titulo,
             fuente = EXCLUDED.fuente,
             updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [
        libroId,
        libro.curso,
        libro.nivel,
        libro.codigo.trim(),
        libro.titulo ?? null,
        libro.fuente ?? null,
      ],
    );
    const id = cab.rows[0]?.id ?? libroId;

    // La IMAGEN de cada página no viene en la transcripción: se extrae aparte
    // del PDF y cuesta minutos. Reemplazar las filas la borraba, así que se
    // guarda por número de página y se devuelve tras reinsertar. Reimportar el
    // texto no puede costar volver a rasterizar el libro entero.
    const previas = await client.query<{ pagina: number; imagen_file_id: string | null }>(
      `SELECT pagina, imagen_file_id FROM catalog_libro_pagina WHERE libro_id = $1`,
      [id],
    );
    const imagenPrevia = new Map(
      previas.rows
        .filter((r) => r.imagen_file_id !== null)
        .map((r) => [r.pagina, r.imagen_file_id as string]),
    );

    await client.query(`DELETE FROM catalog_libro_pagina WHERE libro_id = $1`, [id]);

    // Inserción por LOTES con unnest, igual que las sesiones del salón: un
    // cuadernillo son decenas de páginas y no merecen decenas de viajes.
    await client.query(
      `INSERT INTO catalog_libro_pagina
         (id, libro_id, pagina, numero_impreso, pliego, parada, titulo, elementos, escena)
       SELECT gen_random_uuid(), $1, p.pagina, p.numero_impreso, p.pliego,
              p.parada, p.titulo, p.elementos, p.escena
         FROM unnest($2::int[], $3::int[], $4::int[], $5::int[], $6::text[], $7::jsonb[], $8::jsonb[])
              AS p(pagina, numero_impreso, pliego, parada, titulo, elementos, escena)`,
      [
        id,
        libro.paginas.map((p) => p.pagina),
        libro.paginas.map((p) => p.numeroImpreso ?? null),
        libro.paginas.map((p) => p.pliego ?? null),
        libro.paginas.map((p) => p.parada),
        libro.paginas.map((p) => p.titulo ?? null),
        libro.paginas.map((p) => JSON.stringify(p.elementos)),
        libro.paginas.map((p) => (p.escena == null ? null : JSON.stringify(p.escena))),
      ],
    );

    // Devuelve la imagen a las páginas que ya la tenían.
    if (imagenPrevia.size > 0) {
      await client.query(
        `UPDATE catalog_libro_pagina p
            SET imagen_file_id = v.file_id
           FROM unnest($2::int[], $3::uuid[]) AS v(pagina, file_id)
          WHERE p.libro_id = $1 AND p.pagina = v.pagina`,
        [id, [...imagenPrevia.keys()], [...imagenPrevia.values()]],
      );
    }

    for (const i of libro.insignias ?? []) {
      await client.query(
        `INSERT INTO catalog_insignia (id, curso, nivel, parada, nombre, updated_at)
           VALUES (gen_random_uuid(), $1::catalog_course_tipo, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (curso, nivel, parada) DO UPDATE
           SET nombre = EXCLUDED.nombre, updated_at = CURRENT_TIMESTAMP`,
        [libro.curso, libro.nivel, i.parada, i.nombre.trim()],
      );
    }

    // La auditoría va por su cuenta (no acepta cliente): registra el hecho, no
    // participa del rollback. Es el mismo criterio del resto del módulo.
    await registrarAuditoria({
      actorUserId: input.actorUserId,
      accion: "catalog.libro.importar",
      entidad: "catalog_libro",
      entidadId: id,
      payload: {
        curso: libro.curso,
        nivel: libro.nivel,
        codigo: libro.codigo,
        paginas: libro.paginas.length,
        insignias: (libro.insignias ?? []).length,
      },
      ip: input.ip ?? null,
    });

    return {
      libroId: id,
      paginas: libro.paginas.length,
      insignias: (libro.insignias ?? []).length,
    };
  });
}

interface FilaPagina {
  pagina: number;
  numero_impreso: number | null;
  pliego: number | null;
  parada: number;
  titulo: string | null;
  elementos: ElementoLibro[] | null;
  imagen_file_id: string | null;
  escena: Record<string, unknown> | null;
}

/** Páginas de un libro, en orden. `parada` acota a una sola parada del mapa. */
export async function leerLibro(
  curso: string,
  nivel: string,
  codigo: string,
  parada?: number,
): Promise<{ codigo: string; titulo: string | null; paginas: PaginaLibro[] }> {
  validarClave(curso, nivel);
  const cab = await queryRows<{ id: string; titulo: string | null }>(
    `SELECT id, titulo FROM catalog_libro
      WHERE curso = $1::catalog_course_tipo AND nivel = $2 AND codigo = $3`,
    [curso, nivel, codigo],
  );
  const libro = cab[0];
  if (libro === undefined) throw new NotFoundError("Ese libro no está cargado.");

  const acotar = parada !== undefined;
  if (acotar && !paradaValida(parada)) {
    throw new ValidationError(`Parada inválida: ${String(parada)}.`);
  }
  const filas = await queryRows<FilaPagina>(
    `SELECT pagina, numero_impreso, pliego, parada, titulo, elementos, imagen_file_id, escena
       FROM catalog_libro_pagina
      WHERE libro_id = $1 AND ($2::int IS NULL OR parada = $2::int)
      ORDER BY pagina`,
    [libro.id, acotar ? parada : null],
  );

  // Una escena puede pedir de fondo el BANNER vigente del nivel (el mapa de la
  // isla). Se REFERENCIA, nunca se copia: si cambian el banner, la portada lo
  // sigue sin tocar el libro. Se resuelve una vez, no por página.
  const quiereBanner = filas.some(
    (f) => (f.escena?.["fondo"] as { arte?: unknown } | undefined)?.arte === "banner",
  );
  const bannerId = quiereBanner ? await imagenCursoIdResuelto(curso, nivel) : null;
  const bannerUrl = bannerId !== null ? `/api/catalog/imagen-curso/${bannerId}` : null;

  // La narración va por pliego: se agrupa una vez y cada página toma la suya,
  // en lugar de una consulta por página.
  const pistas = await audiosDeLibro(libro.id);
  const porPliego = new Map<number, PistaLibro[]>();
  for (const p of pistas) {
    const lista = porPliego.get(p.pliego) ?? [];
    lista.push(p);
    porPliego.set(p.pliego, lista);
  }

  return {
    codigo,
    titulo: libro.titulo,
    paginas: filas.map((f) => ({
      pagina: f.pagina,
      numeroImpreso: f.numero_impreso,
      escena:
        f.escena == null
          ? null
          : {
              ...f.escena,
              fondoUrl:
                (f.escena["fondo"] as { arte?: unknown } | undefined)?.arte === "banner"
                  ? bannerUrl
                  : null,
            },
      pliego: f.pliego,
      audios: (f.pliego === null ? [] : (porPliego.get(f.pliego) ?? [])).map((p) => ({
        id: p.id,
        orden: p.orden,
        url: p.url,
        elementoId: p.elementoId,
      })),
      parada: f.parada,
      titulo: f.titulo,
      elementos: f.elementos ?? [],
      // Se sirve por la MISMA ruta que el resto del arte: autenticada, privada
      // y con la caché larga que ya tiene.
      imagenUrl: f.imagen_file_id !== null ? `/api/catalog/imagen-curso/${f.imagen_file_id}` : null,
    })),
  };
}

/** Libros cargados de un nivel, para elegir en el panel. */
export async function listarLibros(
  curso: string,
  nivel: string,
): Promise<{ codigo: string; titulo: string | null; paginas: number }[]> {
  validarClave(curso, nivel);
  return queryRows(
    `SELECT l.codigo, l.titulo, COUNT(p.id)::int AS paginas
       FROM catalog_libro l
       LEFT JOIN catalog_libro_pagina p ON p.libro_id = l.id
      WHERE l.curso = $1::catalog_course_tipo AND l.nivel = $2
      GROUP BY l.id, l.codigo, l.titulo
      ORDER BY l.codigo`,
    [curso, nivel],
  );
}

/** Nombre de la insignia de cada parada del nivel: `{ 0: "Let's chat…", … }`. */
export async function insigniasDeNivelNombres(
  curso: string,
  nivel: string,
): Promise<Record<number, string>> {
  validarClave(curso, nivel);
  const filas = await queryRows<{ parada: number; nombre: string }>(
    `SELECT parada, nombre FROM catalog_insignia
      WHERE curso = $1::catalog_course_tipo AND nivel = $2
      ORDER BY parada`,
    [curso, nivel],
  );
  return Object.fromEntries(filas.map((f) => [f.parada, f.nombre]));
}
