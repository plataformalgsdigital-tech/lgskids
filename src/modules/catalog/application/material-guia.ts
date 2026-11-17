import { registrarAuditoria } from "@/modules/audit";
import { eliminarArchivo, subirArchivo, type PoliticaArchivo } from "@/modules/files";
import { requireAuthSecret } from "@/platform/config/env";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import {
  AYUDA_POR_TAB,
  MIMES_MATERIAL_GUIA,
  MINUTOS_TOKEN_OFFICE,
  TAMANO_MAXIMO_MATERIAL_GUIA,
  TIPOS_POR_TAB,
  detectarArchivoGuia,
  enlaceValido,
  firmarTokenMaterialGuia,
  tabMaterialGuiaValida,
  tokenMaterialGuiaValido,
  type TabMaterialGuia,
  type TipoMaterialGuia,
} from "../domain/material-guia";

/**
 * MATERIAL GUÍA (2026-11-17): el material y los recursos que el guía abre desde la
 * sesión, por lección del catálogo Curso (`catalog_curso`). Cada ítem es UN archivo de
 * `files` (privado, con su propia política: PPT/PPTX, PDF, imágenes y mp4 hasta 80 MB)
 * o UN enlace. Ver `domain/material-guia.ts` para las reglas puras.
 *
 * Cada ítem cuelga de la fila de la lección (CASCADE). Quien borra una lección con material
 * (`eliminarCursoReferencia`) suelta también sus archivos (`soltarMaterialDeLeccion`), para
 * no dejar huérfanos de decenas de MB en `files`.
 */

const ENTIDAD = "catalog_material_guia";

const POLITICA: PoliticaArchivo = {
  mimes: MIMES_MATERIAL_GUIA,
  tamanoMaximo: TAMANO_MAXIMO_MATERIAL_GUIA,
};

export interface ItemMaterialGuia {
  id: string;
  cursoId: string;
  tab: TabMaterialGuia;
  tipo: TipoMaterialGuia;
  titulo: string;
  orden: number;
  enlace: string | null;
  archivo: { nombre: string; bytes: number; mime: string } | null;
}

interface Fila {
  id: string;
  cursoId: string;
  tab: TabMaterialGuia;
  tipo: TipoMaterialGuia;
  titulo: string;
  orden: number;
  enlace: string | null;
  nombre: string | null;
  bytes: string | null;
  mime: string | null;
}

/** Los ítems de una lección (o de una pestaña de ella), por orden. */
export async function listarMaterialGuia(input: {
  cursoId: string;
  tab?: TabMaterialGuia;
}): Promise<ItemMaterialGuia[]> {
  const filas = await queryRows<Fila>(
    `SELECT m.id, m.curso_id AS "cursoId", m.tab, m.tipo, m.titulo, m.orden, m.enlace,
            f.nombre_original AS nombre, f.size_bytes::text AS bytes, f.mime
       FROM catalog_material_guia m
       LEFT JOIN files_object f ON f.id = m.file_id
      WHERE m.curso_id = $1 AND ($2::text IS NULL OR m.tab = $2)
      ORDER BY m.tab, m.orden, m.created_at`,
    [input.cursoId, input.tab ?? null],
  );
  return filas.map((f) => ({
    id: f.id,
    cursoId: f.cursoId,
    tab: f.tab,
    tipo: f.tipo,
    titulo: f.titulo,
    orden: f.orden,
    enlace: f.enlace,
    archivo:
      f.nombre === null || f.mime === null
        ? null
        : { nombre: f.nombre, bytes: Number(f.bytes ?? 0), mime: f.mime },
  }));
}

function nombreSinExtension(nombre: string): string {
  const base = nombre.replace(/\.[^./\\]+$/, "").trim();
  return base === "" ? nombre : base;
}

/**
 * Agrega UN ítem: un archivo o un enlace. El tipo lo decide el CONTENIDO y tiene que
 * ser de los que admite la pestaña (una imagen no entra en Material, un PDF no entra en
 * Recursos). Si el registro falla después de subir el archivo, se suelta el archivo.
 */
export async function subirMaterialGuia(input: {
  actorUserId: string;
  cursoId: string;
  tab: string;
  titulo?: string;
  orden?: number | null;
  archivo?: { nombre: string; bytes: Buffer };
  enlace?: string;
}): Promise<{ id: string }> {
  if (!tabMaterialGuiaValida(input.tab)) {
    throw new ValidationError("La pestaña es 'MATERIAL' o 'RECURSO'.");
  }
  const tab = input.tab;
  const leccion = await queryOne<{ id: string }>(`SELECT id FROM catalog_curso WHERE id = $1`, [
    input.cursoId,
  ]);
  if (leccion === null) throw new NotFoundError("Esa lección no existe en el catálogo.");

  const tieneArchivo = input.archivo !== undefined;
  const tieneEnlace = input.enlace !== undefined && input.enlace.trim() !== "";
  if (tieneArchivo === tieneEnlace) {
    throw new ValidationError("Sube un archivo o escribe un enlace (uno solo por ítem).");
  }

  const id = newId();
  let tipo: TipoMaterialGuia;
  let enlace: string | null = null;
  let fileId: string | null = null;
  let sugerido: string;

  if (input.archivo !== undefined) {
    const detectado = detectarArchivoGuia(input.archivo.nombre, input.archivo.bytes);
    if (detectado === null) {
      throw new ValidationError(
        `“${input.archivo.nombre}” no es un archivo que admita Material Guía (${AYUDA_POR_TAB[tab]}, o el de la otra pestaña).`,
      );
    }
    if (!TIPOS_POR_TAB[tab].includes(detectado.tipo)) {
      throw new ValidationError(
        `“${input.archivo.nombre}” va en ${tab === "MATERIAL" ? "Recursos" : "Material"}: esta pestaña admite ${AYUDA_POR_TAB[tab]}.`,
      );
    }
    tipo = detectado.tipo;
    sugerido = nombreSinExtension(input.archivo.nombre);
    fileId = (
      await subirArchivo({
        actorUserId: input.actorUserId,
        nombreOriginal: input.archivo.nombre,
        mime: detectado.mime,
        bytes: input.archivo.bytes,
        entidad: ENTIDAD,
        entidadId: id,
        politica: POLITICA,
      })
    ).id;
  } else {
    if (tab !== "RECURSO") {
      throw new ValidationError("Los enlaces van en Recursos.");
    }
    const url = enlaceValido(input.enlace ?? "");
    if (url === null) throw new ValidationError("El enlace debe empezar por http:// o https://.");
    tipo = "ENLACE";
    enlace = url;
    sugerido = new URL(url).hostname;
  }

  const titulo = (input.titulo ?? "").trim() || sugerido;
  if (titulo.length > 200) throw new ValidationError("El título admite hasta 200 caracteres.");

  try {
    const siguiente = await queryOne<{ orden: number }>(
      `SELECT COALESCE(max(orden), 0)::int + 1 AS orden
         FROM catalog_material_guia WHERE curso_id = $1 AND tab = $2`,
      [input.cursoId, tab],
    );
    await execute(
      `INSERT INTO catalog_material_guia
         (id, curso_id, tab, tipo, titulo, file_id, enlace, orden, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.cursoId,
        tab,
        tipo,
        titulo,
        fileId,
        enlace,
        input.orden ?? siguiente?.orden ?? 1,
        input.actorUserId,
      ],
    );
  } catch (error) {
    if (fileId !== null) await eliminarArchivo(fileId);
    throw error;
  }
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.material_guia_subido",
    entidad: "catalog_material_guia",
    entidadId: id,
    payload: { cursoId: input.cursoId, tab, tipo, titulo },
  });
  return { id };
}

/** Cambia el título o el orden de un ítem. */
export async function editarMaterialGuia(input: {
  actorUserId: string;
  id: string;
  titulo?: string;
  orden?: number;
}): Promise<void> {
  const titulo = input.titulo?.trim();
  if (titulo !== undefined && (titulo === "" || titulo.length > 200)) {
    throw new ValidationError("El título debe tener entre 1 y 200 caracteres.");
  }
  const r = await queryOne<{ id: string }>(
    `UPDATE catalog_material_guia
        SET titulo = COALESCE($2, titulo), orden = COALESCE($3, orden)
      WHERE id = $1 RETURNING id`,
    [input.id, titulo ?? null, input.orden ?? null],
  );
  if (r === null) throw new NotFoundError("Ese ítem no existe.");
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.material_guia_editado",
    entidad: "catalog_material_guia",
    entidadId: input.id,
    payload: { titulo: titulo ?? null, orden: input.orden ?? null },
  });
}

/** Quita el ítem y suelta su archivo (DESPUÉS de borrar la fila: un fallo no deja una fila sin archivo). */
export async function eliminarMaterialGuia(input: {
  actorUserId: string;
  id: string;
}): Promise<void> {
  const fila = await queryOne<{ fileId: string | null; titulo: string; tab: string }>(
    `DELETE FROM catalog_material_guia WHERE id = $1
      RETURNING file_id AS "fileId", titulo, tab`,
    [input.id],
  );
  if (fila === null) throw new NotFoundError("Ese ítem no existe.");
  if (fila.fileId !== null) await eliminarArchivo(fila.fileId);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.material_guia_eliminado",
    entidad: "catalog_material_guia",
    entidadId: input.id,
    payload: { titulo: fila.titulo, tab: fila.tab },
  });
}

export interface ArchivoDeMaterialGuia {
  id: string;
  tipo: TipoMaterialGuia;
  titulo: string;
  fileId: string | null;
  enlace: string | null;
  nombre: string | null;
}

/** El ítem para SERVIRLO (qué archivo es y de qué tipo), o null. */
export async function archivoDeMaterialGuia(id: string): Promise<ArchivoDeMaterialGuia | null> {
  return queryOne<ArchivoDeMaterialGuia>(
    `SELECT m.id, m.tipo, m.titulo, m.file_id AS "fileId", m.enlace,
            f.nombre_original AS nombre
       FROM catalog_material_guia m LEFT JOIN files_object f ON f.id = m.file_id
      WHERE m.id = $1`,
    [id],
  );
}

// —— Enlace temporal para Office para la web ———————————————————————————————

const ahoraSeg = () => Math.floor(Date.now() / 1000);

/** El token con que Microsoft baja ESTA presentación durante `MINUTOS_TOKEN_OFFICE`. */
export function tokenOfficeParaItem(itemId: string): { token: string; venceEn: number } {
  const venceEn = ahoraSeg() + MINUTOS_TOKEN_OFFICE * 60;
  return { token: firmarTokenMaterialGuia(itemId, venceEn, requireAuthSecret()), venceEn };
}

export function tokenOfficeValido(itemId: string, token: string): boolean {
  return tokenMaterialGuiaValido(itemId, token, requireAuthSecret(), ahoraSeg());
}

/**
 * Los archivos del material de una lección, ANTES de borrarla: la fila se va en cascada
 * y su archivo no. Quien borra la lección llama a `soltarArchivos` con esto DESPUÉS.
 */
export async function archivosDeMaterialDeLeccion(cursoId: string): Promise<string[]> {
  const filas = await queryRows<{ fileId: string }>(
    `SELECT file_id AS "fileId" FROM catalog_material_guia
      WHERE curso_id = $1 AND file_id IS NOT NULL`,
    [cursoId],
  );
  return filas.map((f) => f.fileId);
}

export async function soltarArchivos(ids: string[]): Promise<void> {
  for (const id of ids) await eliminarArchivo(id);
}
