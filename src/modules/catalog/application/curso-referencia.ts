import type { PoolClient } from "pg";
import { registrarAuditoria } from "@/modules/audit";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import {
  claveLeccion,
  planificarFila,
  type AccionImportacion,
  type FilaCsvCurso,
  type PlanFila,
} from "../domain/importacion-curso";
import {
  deleteCursoReferencia,
  existsCursoReferenciaKey,
  getCursoReferencia,
  getCursoReferenciaPorClave,
  insertCursoReferencia,
  listCursoReferencia,
  updateCursoReferencia,
  type CursoReferenciaInput,
  type CursoReferenciaRow,
} from "../infrastructure/catalog-repository";
import { NIVELES, TIPOS_CURSO } from "../domain/curriculo";

export type { CursoReferenciaRow } from "../infrastructure/catalog-repository";

const CURSOS = TIPOS_CURSO.map((c) => c.tipo) as readonly string[];
const NIVELES_CODIGO = NIVELES.map((n) => n.codigo) as readonly string[];

/**
 * REFERENCIA MAESTRA de cursos (catalog_curso): una fila por
 * (curso, nivel, unidad, leccion) con el material/video/actividades/recursos.
 * Independiente de campañas — es la fuente para los paneles de alumno/guía y
 * las actividades de seguimiento.
 */

interface DatosCurso {
  curso: string;
  nivel: string;
  unidad?: string | null | undefined;
  quiz?: unknown;
  leccion: string;
  orden?: number | undefined;
  contenido?: string | null | undefined;
  video?: string | null | undefined;
  clubes?: unknown[] | undefined;
  materialUsuario?: unknown[] | undefined;
  materialGuia?: unknown[] | undefined;
  actividades?: unknown[] | undefined;
  recursos?: unknown[] | undefined;
}

function normalizar(d: DatosCurso): CursoReferenciaInput {
  if (!CURSOS.includes(d.curso)) {
    throw new ValidationError(`Curso inválido: ${d.curso} (JUNIOR | YOUNGSTER).`);
  }
  if (!NIVELES_CODIGO.includes(d.nivel)) {
    throw new ValidationError(`Nivel inválido: ${d.nivel}.`);
  }
  if (d.leccion.trim().length < 1) {
    throw new ValidationError("La lección es obligatoria.");
  }
  return {
    curso: d.curso,
    nivel: d.nivel,
    unidad: d.unidad?.trim() || null,
    quiz: d.quiz ?? null,
    leccion: d.leccion.trim(),
    orden: d.orden ?? 0,
    contenido: d.contenido ?? null,
    video: d.video ?? null,
    clubes: d.clubes ?? [],
    materialUsuario: d.materialUsuario ?? [],
    materialGuia: d.materialGuia ?? [],
    actividades: d.actividades ?? [],
    recursos: d.recursos ?? [],
  };
}

export async function listarCursoReferencia(filtros?: {
  curso?: string | undefined;
  nivel?: string | undefined;
}): Promise<CursoReferenciaRow[]> {
  return listCursoReferencia(filtros);
}

export async function obtenerCursoReferencia(id: string): Promise<CursoReferenciaRow> {
  const row = await getCursoReferencia(id);
  if (row === null) throw new NotFoundError("La referencia de curso no existe.");
  return row;
}

export async function crearCursoReferencia(
  input: { actorUserId: string; ip?: string | null } & DatosCurso,
): Promise<{ id: string }> {
  const datos = normalizar(input);
  if (await existsCursoReferenciaKey(datos.curso, datos.nivel, datos.unidad, datos.leccion)) {
    throw new ConflictError(
      `Ya existe "${datos.leccion}" para ${datos.curso} · ${datos.nivel}${datos.unidad ? ` · ${datos.unidad}` : ""}.`,
    );
  }
  const id = newId();
  await insertCursoReferencia(id, datos);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.curso_referencia_creada",
    entidad: "catalog_curso",
    entidadId: id,
    payload: { curso: datos.curso, nivel: datos.nivel, leccion: datos.leccion },
    ip: input.ip ?? null,
  });
  return { id };
}

export async function actualizarCursoReferencia(
  input: { actorUserId: string; id: string; ip?: string | null } & DatosCurso,
): Promise<void> {
  const actual = await getCursoReferencia(input.id);
  if (actual === null) throw new NotFoundError("La referencia de curso no existe.");
  const clave = normalizar(input);
  if (
    await existsCursoReferenciaKey(clave.curso, clave.nivel, clave.unidad, clave.leccion, input.id)
  ) {
    throw new ConflictError(
      `Ya existe "${clave.leccion}" para ${clave.curso} · ${clave.nivel}${clave.unidad ? ` · ${clave.unidad}` : ""}.`,
    );
  }
  // LO QUE NO VIENE, NO SE TOCA (2026-10-06). Gestión de Contenido manda solo
  // temario, video, actividades y cuestionarios, y `normalizar` rellenaba con
  // `[]` el resto: guardar una lección borraba su material del guía y del
  // alumno, sus recursos y sus clubes. Y como el esquema de la API descarta las
  // claves que no conoce, las actividades llegaban sin `x/y/w/h` y se perdía la
  // ubicación de cada juego en la lámina. Es la MISMA regla de la carga por CSV
  // (`planificarFila`): un campo ausente conserva lo guardado y las zonas se
  // mantienen por enlace. La diferencia es el cuestionario: este editor SÍ lo
  // edita, así que el que viene reemplaza al guardado (`null` lo borra).
  const plan = planificarFila(
    {
      curso: clave.curso,
      nivel: clave.nivel,
      unidad: clave.unidad,
      leccion: clave.leccion,
      orden: input.orden,
      contenido: input.contenido,
      video: input.video,
      materialGuia: input.materialGuia,
      materialUsuario: input.materialUsuario,
      actividades: input.actividades,
      recursos: input.recursos,
      clubes: input.clubes,
    },
    actual,
  );
  const datos: CursoReferenciaInput = {
    curso: clave.curso,
    nivel: clave.nivel,
    unidad: clave.unidad,
    leccion: clave.leccion,
    ...plan.resultado,
    quiz: input.quiz !== undefined ? (input.quiz ?? null) : actual.quiz,
  };
  await updateCursoReferencia(input.id, datos);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.curso_referencia_editada",
    entidad: "catalog_curso",
    entidadId: input.id,
    payload: { curso: datos.curso, nivel: datos.nivel, leccion: datos.leccion },
    ip: input.ip ?? null,
  });
}

/** Una fila tal como llega del CSV; `linea` es la del archivo (2 = primera de datos). */
export type FilaImportacion = DatosCurso & { linea?: number | undefined };

export interface FilaValidada {
  linea: number;
  curso: string;
  nivel: string;
  unidad: string | null;
  leccion: string;
  accion: AccionImportacion | null;
  cambios: string[];
  avisos: string[];
  error: string | null;
}

export interface ValidacionImportacion {
  filas: FilaValidada[];
  resumen: { crear: number; actualizar: number; sinCambios: number; errores: number };
}

/** Como `normalizar`, pero lo que no vino queda `undefined`: no se toca. */
function filaDelCsv(d: DatosCurso): FilaCsvCurso {
  if (!CURSOS.includes(d.curso)) {
    throw new ValidationError(`Curso inválido: ${d.curso} (JUNIOR | YOUNGSTER).`);
  }
  if (!NIVELES_CODIGO.includes(d.nivel)) throw new ValidationError(`Nivel inválido: ${d.nivel}.`);
  if (d.leccion.trim() === "") throw new ValidationError("La lección es obligatoria.");
  return {
    curso: d.curso,
    nivel: d.nivel,
    unidad: d.unidad?.trim() || null,
    leccion: d.leccion.trim(),
    orden: d.orden,
    contenido: d.contenido,
    video: d.video,
    materialGuia: d.materialGuia,
    materialUsuario: d.materialUsuario,
    actividades: d.actividades,
    recursos: d.recursos,
    clubes: d.clubes,
  };
}

/**
 * Qué pasaría con cada fila. Es el MISMO cálculo al validar y al cargar
 * (`planificarFila`), así que lo que la pantalla promete antes de la
 * confirmación es lo que después se escribe.
 */
async function planificar(
  filas: FilaImportacion[],
  client?: PoolClient,
): Promise<
  { fila: FilaValidada; datos: FilaCsvCurso | null; plan: PlanFila | null; id: string | null }[]
> {
  const vistas = new Set<string>();
  const salida = [];
  for (let i = 0; i < filas.length; i += 1) {
    const cruda = filas[i]!;
    const base: FilaValidada = {
      linea: cruda.linea ?? i + 2,
      curso: cruda.curso,
      nivel: cruda.nivel,
      unidad: cruda.unidad?.trim() || null,
      leccion: cruda.leccion.trim(),
      accion: null,
      cambios: [],
      avisos: [],
      error: null,
    };
    try {
      const datos = filaDelCsv(cruda);
      const clave = claveLeccion(datos);
      // Dos filas con la misma lección: la segunda pisaría a la primera en
      // silencio, y el previo diría "crear" dos veces.
      if (vistas.has(clave)) throw new ValidationError("La lección está repetida en el archivo.");
      vistas.add(clave);
      const actual = await getCursoReferenciaPorClave(datos, client);
      const plan = planificarFila(datos, actual);
      salida.push({
        fila: { ...base, accion: plan.accion, cambios: plan.cambios, avisos: plan.avisos },
        datos,
        plan,
        id: actual?.id ?? null,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "Fila inválida.";
      salida.push({ fila: { ...base, error }, datos: null, plan: null, id: null });
    }
  }
  return salida;
}

function resumir(filas: FilaValidada[]): ValidacionImportacion["resumen"] {
  return {
    crear: filas.filter((f) => f.accion === "CREAR").length,
    actualizar: filas.filter((f) => f.accion === "ACTUALIZAR").length,
    sinCambios: filas.filter((f) => f.accion === "SIN_CAMBIOS").length,
    errores: filas.filter((f) => f.error !== null).length,
  };
}

/** VALIDA el archivo contra la base sin escribir nada: el previo de la confirmación. */
export async function validarImportacionCurso(
  filas: FilaImportacion[],
): Promise<ValidacionImportacion> {
  const plan = await planificar(filas);
  const validadas = plan.map((p) => p.fila);
  return { filas: validadas, resumen: resumir(validadas) };
}

/**
 * CARGA el archivo: TODO o NADA, en una transacción. Antes cargaba fila por
 * fila y un error a la mitad dejaba el nivel a medio actualizar, con la
 * pantalla diciendo "creadas 12, 1 error" y sin forma de saber qué había
 * quedado de cada versión. Si alguna fila falla, no se escribe ninguna.
 */
export async function importarCursoReferencia(input: {
  actorUserId: string;
  filas: FilaImportacion[];
  ip?: string | null;
}): Promise<ValidacionImportacion["resumen"]> {
  const resumen = await withTransaction(async (client) => {
    const plan = await planificar(input.filas, client);
    const conError = plan.filter((p) => p.fila.error !== null);
    if (conError.length > 0) {
      const primeras = conError
        .slice(0, 3)
        .map((p) => `línea ${String(p.fila.linea)}: ${p.fila.error ?? ""}`)
        .join("; ");
      throw new ValidationError(
        `No se cargó nada: ${String(conError.length)} fila(s) con error (${primeras}).`,
      );
    }
    for (const p of plan) {
      if (p.datos === null || p.plan === null || p.plan.accion === "SIN_CAMBIOS") continue;
      const r = p.plan.resultado;
      const guardar = {
        curso: p.datos.curso,
        nivel: p.datos.nivel,
        unidad: p.datos.unidad,
        leccion: p.datos.leccion,
        ...r,
      };
      if (p.id === null) await insertCursoReferencia(newId(), guardar, client);
      else await updateCursoReferencia(p.id, guardar, client);
    }
    return resumir(plan.map((p) => p.fila));
  });

  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.curso_referencia_importada",
    entidad: "catalog_curso",
    entidadId: null,
    payload: resumen,
    ip: input.ip ?? null,
  });
  return resumen;
}

export async function eliminarCursoReferencia(input: {
  actorUserId: string;
  id: string;
  ip?: string | null;
}): Promise<void> {
  const actual = await getCursoReferencia(input.id);
  if (actual === null) throw new NotFoundError("La referencia de curso no existe.");
  await deleteCursoReferencia(input.id);
  await registrarAuditoria({
    actorUserId: input.actorUserId,
    accion: "catalog.curso_referencia_eliminada",
    entidad: "catalog_curso",
    entidadId: input.id,
    payload: { curso: actual.curso, nivel: actual.nivel, leccion: actual.leccion },
    ip: input.ip ?? null,
  });
}
