import { registrarAuditoria } from "@/modules/audit";
import {
  eliminarArchivo,
  listarArchivos,
  metaArchivo,
  subirArchivo,
  type ArchivoMeta,
  type PoliticaArchivo,
} from "@/modules/files";
import { ValidationError } from "@/platform/errors";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";
import { esHtml, esPdf } from "../domain/libro-interactivo";

/**
 * Material del alumno por (curso, nivel): lo que abre el botón "Material" del
 * panel del niño.
 *  - interactivo: el libro interactivo, un HTML autocontenido que se abre en
 *    el panel dentro de una caja (ver `domain/libro-interactivo.ts`).
 *  - imprimible:  el mismo libro en PDF, para descargar e imprimir.
 *
 * Vive en `files` como el arte, con clave `CURSO:NIVEL`, pero con reglas
 * PROPIAS: son archivos de 30 MB y uno es HTML, dos cosas que la lista general
 * de `files` no debe admitir para contratos, fotos o arte.
 */

export type MaterialTipo = "interactivo" | "imprimible";
export const TIPOS_MATERIAL: readonly MaterialTipo[] = ["interactivo", "imprimible"];

/**
 * Tope por archivo. Con los videos aparte (ver `video-libro.ts`) el libro de
 * Junior·Rookie pesa 22,6 MB y su PDF hasta 47 MB; el margen es para niveles
 * más largos. Un libro que no entra casi siempre trae videos incrustados.
 */
export const TAMANO_MAXIMO_MATERIAL = 80 * 1024 * 1024;

/**
 * Entidad en `files`: `catalog_material_interactivo` / `…_imprimible`.
 *
 * El prefijo se puede cambiar SOLO en pruebas: la clave `CURSO:NIVEL` es la
 * misma que usa el material real, y una prueba que "reemplaza" el libro de
 * Junior·Rookie borraría el de verdad en la base de desarrollo.
 */
let prefijoEntidad = "catalog_material";
const entidad = (tipo: MaterialTipo) => `${prefijoEntidad}_${tipo}`;

/** Solo pruebas: aísla sus filas de las reales. */
export function setPrefijoMaterialParaPruebas(prefijo: string): void {
  prefijoEntidad = prefijo;
}

const MIME: Record<MaterialTipo, string> = {
  interactivo: "text/html",
  imprimible: "application/pdf",
};

const POLITICA: Record<MaterialTipo, PoliticaArchivo> = {
  interactivo: { mimes: new Map([["text/html", "html"]]), tamanoMaximo: TAMANO_MAXIMO_MATERIAL },
  imprimible: {
    mimes: new Map([["application/pdf", "pdf"]]),
    tamanoMaximo: TAMANO_MAXIMO_MATERIAL,
  },
};

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const CODIGOS_NIVEL = NIVELES.map((n) => n.codigo) as readonly string[];

export function tipoMaterialValido(v: unknown): v is MaterialTipo {
  return typeof v === "string" && (TIPOS_MATERIAL as readonly string[]).includes(v);
}

/**
 * Clave `CURSO:NIVEL`. Solo niveles REALES: a diferencia del banner, aquí no
 * hay "TODOS" — cada nivel tiene su propio libro.
 */
export function claveMaterial(curso: string, nivel: string): string {
  if (!CURSOS.includes(curso)) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (!CODIGOS_NIVEL.includes(nivel)) throw new ValidationError(`Nivel inválido: ${nivel}.`);
  return `${curso}:${nivel}`;
}

/**
 * El MIME lo decide el CONTENIDO, no lo que diga el navegador: en Windows un
 * .html puede llegar sin tipo, y un PDF renombrado a .html no debe pasar por
 * libro interactivo.
 */
function verificarContenido(tipo: MaterialTipo, nombre: string, bytes: Buffer): string {
  const extension = nombre.toLowerCase().split(".").pop() ?? "";
  if (tipo === "interactivo") {
    if (!["html", "htm"].includes(extension) || !esHtml(bytes)) {
      throw new ValidationError("El libro interactivo debe ser un archivo HTML (.html).");
    }
  } else if (extension !== "pdf" || !esPdf(bytes)) {
    throw new ValidationError("El libro para descargar debe ser un PDF (.pdf).");
  }
  return MIME[tipo];
}

/**
 * Sube (o REEMPLAZA) el material de un nivel.
 *
 * Reemplazar suelta el anterior: `subirArchivo` siempre crea uno nuevo, y con
 * archivos de 30 MB cada reemplazo sin limpiar dejaría otro tanto huérfano en
 * disco. Se borra DESPUÉS de subir el nuevo, así un fallo a medio camino deja
 * el material viejo en su sitio en lugar de dejar el nivel sin libro.
 */
export async function subirMaterial(input: {
  actorUserId: string;
  tipo: MaterialTipo;
  curso: string;
  nivel: string;
  nombreOriginal: string;
  bytes: Buffer;
}): Promise<{ id: string }> {
  const entidadId = claveMaterial(input.curso, input.nivel);
  const mime = verificarContenido(input.tipo, input.nombreOriginal, input.bytes);
  const anteriores = await listarArchivos({ entidad: entidad(input.tipo), entidadId });
  const r = await subirArchivo({
    actorUserId: input.actorUserId,
    nombreOriginal: input.nombreOriginal,
    mime,
    bytes: input.bytes,
    entidad: entidad(input.tipo),
    entidadId,
    politica: POLITICA[input.tipo],
  });
  for (const a of anteriores) await eliminarArchivo(a.id);
  return r;
}

export interface MaterialResumen {
  id: string;
  nombre: string;
  bytes: number;
  subidoEn: Date;
}

function resumen(a: ArchivoMeta): MaterialResumen {
  return { id: a.id, nombre: a.nombreOriginal, bytes: a.sizeBytes, subidoEn: a.createdAt };
}

/** El material vigente de un nivel (el último subido), o null. */
export async function materialVigente(
  tipo: MaterialTipo,
  curso: string,
  nivel: string,
): Promise<MaterialResumen | null> {
  const [a] = await listarArchivos({
    entidad: entidad(tipo),
    entidadId: claveMaterial(curso, nivel),
    limit: 1,
  });
  return a === undefined ? null : resumen(a);
}

export interface MaterialNivel {
  nivel: string;
  nombreNivel: string;
  interactivo: MaterialResumen | null;
  imprimible: MaterialResumen | null;
}

/** Tablero de mantenimiento: curso × nivel × tipo, en dos consultas. */
export async function estadoMaterial(): Promise<Record<string, MaterialNivel[]>> {
  const porTipo = await Promise.all(
    TIPOS_MATERIAL.map(async (tipo) => {
      // Ordenados del más reciente al más antiguo: el primero de cada clave
      // es el vigente. 200 cubre de sobra 2 cursos × 5 niveles.
      const todos = await listarArchivos({ entidad: entidad(tipo), limit: 200 });
      const vigente = new Map<string, MaterialResumen>();
      for (const a of todos) {
        if (a.entidadId !== null && !vigente.has(a.entidadId)) vigente.set(a.entidadId, resumen(a));
      }
      return vigente;
    }),
  );
  const [interactivos, imprimibles] = porTipo as [
    Map<string, MaterialResumen>,
    Map<string, MaterialResumen>,
  ];
  return Object.fromEntries(
    CURSOS.map((curso) => [
      curso,
      NIVELES.map((n) => ({
        nivel: n.codigo,
        nombreNivel: n.nombre,
        interactivo: interactivos.get(`${curso}:${n.codigo}`) ?? null,
        imprimible: imprimibles.get(`${curso}:${n.codigo}`) ?? null,
      })),
    ]),
  );
}

/** Quita el material de un nivel: filas y bytes. Devuelve cuántos archivos borró. */
export async function eliminarMaterial(input: {
  actorUserId: string;
  tipo: MaterialTipo;
  curso: string;
  nivel: string;
}): Promise<{ eliminados: number }> {
  const entidadId = claveMaterial(input.curso, input.nivel);
  const archivos = await listarArchivos({ entidad: entidad(input.tipo), entidadId });
  for (const a of archivos) await eliminarArchivo(a.id);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.material.eliminado",
    entidad: entidad(input.tipo),
    entidadId,
    payload: { archivos: archivos.map((a) => a.nombreOriginal) },
  });
  return { eliminados: archivos.length };
}

export interface ArchivoMaterial {
  tipo: MaterialTipo;
  curso: string;
  nivel: string;
  nombreOriginal: string;
}

/**
 * ¿Este archivo ES material, y de qué nivel? null si no lo es.
 *
 * Quien sirve material por id DEBE preguntar esto primero: sin la comprobación,
 * la ruta serviría cualquier archivo de `files` —fotos de menores incluidas— a
 * quien tuviera el id.
 */
export async function archivoDeMaterial(id: string): Promise<ArchivoMaterial | null> {
  const meta = await metaArchivo(id);
  if (meta === null || meta.entidadId === null) return null;
  const tipo = TIPOS_MATERIAL.find((t) => entidad(t) === meta.entidad);
  if (tipo === undefined) return null;
  const [curso, nivel] = meta.entidadId.split(":");
  if (curso === undefined || nivel === undefined) return null;
  return { tipo, curso, nivel, nombreOriginal: meta.nombreOriginal };
}
