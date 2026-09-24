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
import { PARADAS, etiquetaParada, paradaValida } from "../domain/unidad-mapa";

/**
 * Material del alumno: lo que abre el botón "Material" del panel del niño.
 *  - interactivo: el libro interactivo, un HTML autocontenido que se abre en
 *    su propia pestaña dentro de una caja (ver `domain/libro-interactivo.ts`).
 *    Es UNO POR NIVEL, clave `CURSO:NIVEL`.
 *  - imprimible:  el libro en PDF, **por UNIDAD** desde 2026-09-23 (clave
 *    `CURSO:NIVEL:PARADA`). El nivel se abre de a poco —el guía va abriendo
 *    cada misión—, así que el PDF sigue el mismo ritmo: el niño descarga la
 *    unidad que está trabajando, no el libro entero.
 *  - actividades: el libro de actividades, también en PDF. Va por unidad Y,
 *    además, admite el del NIVEL COMPLETO (clave `CURSO:NIVEL`, sin unidad),
 *    que se le habilita al niño cuando su guía ya le abrió las cuatro.
 *
 * Vive en `files` como el arte, pero con reglas PROPIAS: son archivos de
 * decenas de MB y uno es HTML, dos cosas que la lista general de `files` no
 * debe admitir para contratos, fotos o arte.
 */

export type MaterialTipo = "interactivo" | "imprimible" | "actividades";
export const TIPOS_MATERIAL: readonly MaterialTipo[] = ["interactivo", "imprimible", "actividades"];

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
  actividades: "application/pdf",
};

const PDF_POLITICA: PoliticaArchivo = {
  mimes: new Map([["application/pdf", "pdf"]]),
  tamanoMaximo: TAMANO_MAXIMO_MATERIAL,
};

const POLITICA: Record<MaterialTipo, PoliticaArchivo> = {
  interactivo: { mimes: new Map([["text/html", "html"]]), tamanoMaximo: TAMANO_MAXIMO_MATERIAL },
  imprimible: PDF_POLITICA,
  actividades: PDF_POLITICA,
};

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const CODIGOS_NIVEL = NIVELES.map((n) => n.codigo) as readonly string[];

export function tipoMaterialValido(v: unknown): v is MaterialTipo {
  return typeof v === "string" && (TIPOS_MATERIAL as readonly string[]).includes(v);
}

/**
 * Clave `CURSO:NIVEL` y, para el PDF, `CURSO:NIVEL:PARADA`. Solo niveles
 * REALES: a diferencia del banner, aquí no hay "TODOS" — cada nivel tiene su
 * propio libro.
 */
export function claveMaterial(curso: string, nivel: string, parada?: number | null): string {
  if (!CURSOS.includes(curso)) throw new ValidationError(`Curso inválido: ${curso}.`);
  if (!CODIGOS_NIVEL.includes(nivel)) throw new ValidationError(`Nivel inválido: ${nivel}.`);
  if (parada == null) return `${curso}:${nivel}`;
  if (!paradaValida(parada)) throw new ValidationError(`Unidad inválida: ${String(parada)}.`);
  return `${curso}:${nivel}:${String(parada)}`;
}

/**
 * Quién lleva unidad y quién no:
 *  - interactivo: NUNCA (es uno por nivel; con unidad aparecería cinco veces);
 *  - imprimible:  SIEMPRE (sin unidad nadie podría abrirlo: el guía abre
 *    unidades, no niveles);
 *  - actividades: las dos cosas — una por unidad y, sin unidad, el del nivel
 *    completo, que se habilita cuando están abiertas las cuatro.
 */
function exigirParada(tipo: MaterialTipo, parada?: number | null): number | null {
  if (tipo === "imprimible") {
    if (parada == null) throw new ValidationError("Elige la unidad del libro para descargar.");
    return parada;
  }
  if (tipo === "actividades") return parada ?? null;
  return null;
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
    throw new ValidationError(
      tipo === "actividades"
        ? "El libro de actividades debe ser un PDF (.pdf)."
        : "El libro para descargar debe ser un PDF (.pdf).",
    );
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
  /** Obligatoria en el PDF (va por unidad); el interactivo no la lleva. */
  parada?: number | null;
  nombreOriginal: string;
  bytes: Buffer;
}): Promise<{ id: string }> {
  const parada = exigirParada(input.tipo, input.parada);
  const entidadId = claveMaterial(input.curso, input.nivel, parada);
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

/** El material vigente (el último subido), o null. El PDF, por unidad. */
export async function materialVigente(
  tipo: MaterialTipo,
  curso: string,
  nivel: string,
  parada?: number | null,
): Promise<MaterialResumen | null> {
  const [a] = await listarArchivos({
    entidad: entidad(tipo),
    entidadId: claveMaterial(curso, nivel, parada),
    limit: 1,
  });
  return a === undefined ? null : resumen(a);
}

export interface CasillaUnidad {
  parada: number;
  etiqueta: string;
  archivo: MaterialResumen | null;
}

export interface MaterialNivel {
  nivel: string;
  nombreNivel: string;
  interactivo: MaterialResumen | null;
  /** Un PDF por unidad: el niño ve los de las unidades que le abrieron. */
  imprimibles: CasillaUnidad[];
  /**
   * PDF del NIVEL ENTERO cargado antes de 2026-09-23, cuando no iba por unidad.
   * Ya no se sirve al niño; se muestra en mantenimiento solo para poder quitarlo.
   */
  imprimibleCompleto: MaterialResumen | null;
  /** Libro de ACTIVIDADES, por unidad. */
  actividades: CasillaUnidad[];
  /** Y el del nivel entero: se habilita con las cuatro unidades abiertas. */
  actividadesCompleto: MaterialResumen | null;
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
  const [interactivos, imprimibles, actividades] = porTipo as [
    Map<string, MaterialResumen>,
    Map<string, MaterialResumen>,
    Map<string, MaterialResumen>,
  ];
  const casillas = (mapa: Map<string, MaterialResumen>, clave: string): CasillaUnidad[] =>
    PARADAS.map((parada) => ({
      parada,
      etiqueta: etiquetaParada(parada),
      archivo: mapa.get(`${clave}:${String(parada)}`) ?? null,
    }));

  return Object.fromEntries(
    CURSOS.map((curso) => [
      curso,
      NIVELES.map((n) => {
        const clave = `${curso}:${n.codigo}`;
        return {
          nivel: n.codigo,
          nombreNivel: n.nombre,
          interactivo: interactivos.get(clave) ?? null,
          imprimibles: casillas(imprimibles, clave),
          imprimibleCompleto: imprimibles.get(clave) ?? null,
          actividades: casillas(actividades, clave),
          actividadesCompleto: actividades.get(clave) ?? null,
        };
      }),
    ]),
  );
}

/** Quita el material de un nivel: filas y bytes. Devuelve cuántos archivos borró. */
export async function eliminarMaterial(input: {
  actorUserId: string;
  tipo: MaterialTipo;
  curso: string;
  nivel: string;
  /** La unidad del PDF; sin ella se quita el del nivel entero (el antiguo). */
  parada?: number | null;
}): Promise<{ eliminados: number }> {
  const entidadId = claveMaterial(input.curso, input.nivel, input.parada);
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
  /** La unidad del PDF; null en el libro interactivo (es de todo el nivel). */
  parada: number | null;
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
  const [curso, nivel, parada] = meta.entidadId.split(":");
  if (curso === undefined || nivel === undefined) return null;
  const n = parada === undefined ? null : Number(parada);
  return {
    tipo,
    curso,
    nivel,
    parada: n !== null && paradaValida(n) ? n : null,
    nombreOriginal: meta.nombreOriginal,
  };
}
