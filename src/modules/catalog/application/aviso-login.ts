import { randomUUID } from "node:crypto";
import { descargarArchivo, eliminarArchivo, subirArchivo } from "@/modules/files";
import { execute, queryOne } from "@/platform/db/query";
import { NotFoundError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logging/logger";
import { arteId } from "./imagen-curso";

/**
 * Avisos de la pantalla de login: un CARRUSEL de hasta 3 imágenes que
 * administración agrega, quita, ordena, prende/apaga y programa (desde/hasta)
 * sin despliegue. Mismo comportamiento que MOSAICO2026 y LGS2026, con dos
 * diferencias deliberadas:
 *
 *  - Las imágenes NO se guardan en base64 en la configuración: van por el
 *    módulo `files` (entidad 'login_aviso', entidad_id = id del aviso), que ya
 *    trae validación de MIME, tope de tamaño y almacenamiento real.
 *  - Se sirven por una ruta pública PROPIA que recibe el id del AVISO, nunca
 *    un id de archivo, y solo entrega la imagen si ese aviso está vigente: si
 *    recibiera un id de archivo, cualquiera podría pedir archivos privados de
 *    menores sin sesión.
 *
 * La lista vive en `platform_config.login_avisos` (JSON) y el interruptor
 * general en `platform_config.login_aviso_activo`.
 *
 * Legado: antes había UNA imagen (arte tipo `aviso_login`, entidad_id
 * 'GLOBAL'). Mientras no exista `login_avisos`, esa imagen se presenta como
 * el aviso único; el primer cambio en el panel la guarda ya como lista.
 */

const CLAVE_ACTIVO = "login_aviso_activo";
const CLAVE_LISTA = "login_avisos";

/** entidad de `files` donde viven las imágenes de los avisos. */
export const ENTIDAD_AVISO_LOGIN = "login_aviso";

export const MAX_AVISOS_LOGIN = 3;

export type AvisoLoginItem = {
  id: string;
  fileId: string;
  /** Referencia interna ("Feriado 31-oct"). */
  nombre: string;
  activo: boolean;
  orden: number;
  /** YYYY-MM-DD, inclusive, en hora de Bogotá/Lima. null = sin límite. */
  desde: string | null;
  hasta: string | null;
  subidoEn: string;
};

export type AvisoLogin = {
  /** Interruptor general. */
  activo: boolean;
  avisos: AvisoLoginItem[];
  actualizadoEn: string | null;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy (YYYY-MM-DD) en Bogotá: la zona más al oeste de los países LGS. */
export function hoyAvisoLogin(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function avisoVigente(a: AvisoLoginItem, hoy = hoyAvisoLogin()): boolean {
  if (!a.activo) return false;
  if (a.desde !== null && hoy < a.desde) return false;
  if (a.hasta !== null && hoy > a.hasta) return false;
  return true;
}

function ordenar(l: AvisoLoginItem[]): AvisoLoginItem[] {
  return [...l].sort((a, b) => a.orden - b.orden);
}

async function leerConfig(clave: string) {
  return queryOne<{ valor: string; actualizado_en: string }>(
    `SELECT valor, actualizado_en::text AS actualizado_en FROM platform_config WHERE clave = $1`,
    [clave],
  );
}

async function escribirConfig(clave: string, valor: string, actorUserId: string) {
  await execute(
    `INSERT INTO platform_config (clave, valor, actualizado_por, actualizado_en)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (clave) DO UPDATE
       SET valor = EXCLUDED.valor,
           actualizado_por = EXCLUDED.actualizado_por,
           actualizado_en = CURRENT_TIMESTAMP`,
    [clave, valor, actorUserId],
  );
}

async function leerLista(): Promise<AvisoLoginItem[]> {
  const fila = await leerConfig(CLAVE_LISTA);
  if (fila === null) {
    // Aún no se usó el carrusel: la imagen única de antes es el aviso 1.
    const legado = await arteId("aviso_login");
    return legado === null
      ? []
      : [{
          id: "legado", fileId: legado, nombre: "Aviso actual", activo: true, orden: 1,
          desde: null, hasta: null, subidoEn: new Date(0).toISOString(),
        }];
  }
  try {
    const lista: unknown = JSON.parse(fila.valor);
    return Array.isArray(lista) ? ordenar(lista as AvisoLoginItem[]) : [];
  } catch {
    return [];
  }
}

async function guardarLista(lista: AvisoLoginItem[], actorUserId: string) {
  const normal = ordenar(lista).map((a, i) => ({ ...a, orden: i + 1 }));
  await escribirConfig(CLAVE_LISTA, JSON.stringify(normal), actorUserId);
}

/** Estado completo para el panel: interruptor + lista (también los apagados). */
export async function getAvisoLogin(): Promise<AvisoLogin> {
  const [fila, avisos] = await Promise.all([leerConfig(CLAVE_ACTIVO), leerLista()]);
  return { activo: fila?.valor === "true", avisos, actualizadoEn: fila?.actualizado_en ?? null };
}

/** Lo que ve el login: los avisos vigentes, en orden (vacío si está apagado). */
export async function avisosLoginVigentes(): Promise<AvisoLoginItem[]> {
  const estado = await getAvisoLogin();
  if (!estado.activo) return [];
  const hoy = hoyAvisoLogin();
  return estado.avisos.filter((a) => avisoVigente(a, hoy));
}

/** Prende o apaga TODOS los avisos del login. */
export async function setAvisoLoginActivo(activo: boolean, actorUserId: string): Promise<AvisoLogin> {
  await escribirConfig(CLAVE_ACTIVO, activo ? "true" : "false", actorUserId);
  return getAvisoLogin();
}

function validarFecha(v: unknown, campo: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !FECHA.test(v)) throw new ValidationError(`${campo}: fecha inválida.`);
  return v;
}

function validarRango(desde: string | null, hasta: string | null) {
  if (desde !== null && hasta !== null && desde > hasta) {
    throw new ValidationError('La fecha "desde" no puede ser posterior a "hasta".');
  }
}

/** Agrega un aviso al final del carrusel (máx. 3). */
export async function agregarAvisoLogin(input: {
  actorUserId: string;
  nombreOriginal: string;
  mime: string;
  bytes: Buffer;
  nombre?: string;
  desde?: unknown;
  hasta?: unknown;
}): Promise<AvisoLogin> {
  const lista = await leerLista();
  if (lista.length >= MAX_AVISOS_LOGIN) {
    throw new ValidationError(
      `Máximo ${String(MAX_AVISOS_LOGIN)} avisos. Quita uno para agregar otro.`,
    );
  }
  const desde = validarFecha(input.desde, "Desde");
  const hasta = validarFecha(input.hasta, "Hasta");
  validarRango(desde, hasta);
  const id = randomUUID();
  const { id: fileId } = await subirArchivo({
    actorUserId: input.actorUserId,
    nombreOriginal: input.nombreOriginal,
    mime: input.mime,
    bytes: input.bytes,
    entidad: ENTIDAD_AVISO_LOGIN,
    entidadId: id,
  });
  const nombre = (input.nombre ?? "").trim().slice(0, 80) || `Aviso ${String(lista.length + 1)}`;
  await guardarLista(
    [...lista, {
      id, fileId, nombre, activo: true, orden: lista.length + 1, desde, hasta,
      subidoEn: new Date().toISOString(),
    }],
    input.actorUserId,
  );
  return getAvisoLogin();
}

/**
 * Reemplaza orden y datos de los avisos. Exige la lista COMPLETA (mismos ids):
 * así un cambio de orden nunca deja avisos fuera.
 */
export async function editarAvisosLogin(
  cambios: {
    id: string;
    nombre?: string | undefined;
    activo?: boolean | undefined;
    desde?: string | null | undefined;
    hasta?: string | null | undefined;
  }[],
  actorUserId: string,
): Promise<AvisoLogin> {
  const actuales = await leerLista();
  const porId = new Map(actuales.map((a) => [a.id, a]));
  if (cambios.length !== actuales.length || cambios.some((c) => !porId.has(c.id))) {
    throw new ValidationError("La lista de avisos cambió; recarga la página.");
  }
  const nuevos = cambios.map((c, i) => {
    const a = porId.get(c.id) as AvisoLoginItem;
    const desde = c.desde === undefined ? a.desde : validarFecha(c.desde, "Desde");
    const hasta = c.hasta === undefined ? a.hasta : validarFecha(c.hasta, "Hasta");
    validarRango(desde, hasta);
    const nombre = typeof c.nombre === "string" && c.nombre.trim() !== "" ? c.nombre.trim().slice(0, 80) : a.nombre;
    return { ...a, nombre, activo: c.activo ?? a.activo, desde, hasta, orden: i + 1 };
  });
  await guardarLista(nuevos, actorUserId);
  return getAvisoLogin();
}

/** Quita SOLO ese aviso (y su imagen); los demás quedan igual. */
export async function quitarAvisoLogin(id: string, actorUserId: string): Promise<AvisoLogin> {
  const lista = await leerLista();
  const aviso = lista.find((a) => a.id === id);
  if (aviso === undefined) throw new NotFoundError("Aviso no encontrado.");
  await guardarLista(lista.filter((a) => a.id !== id), actorUserId);
  try {
    await eliminarArchivo(aviso.fileId);
  } catch (error) {
    logger.warn("No se pudo borrar la imagen del aviso de login", { id, error: String(error) });
  }
  return getAvisoLogin();
}

/**
 * Bytes de un aviso PARA LA RUTA PÚBLICA. Solo entrega algo si ese aviso está
 * vigente (interruptor general + el suyo + fechas): apagarlo deja de exponer la
 * imagen, no solo de mostrarla. Sin id → el primero vigente (login antiguo).
 */
export async function descargarAvisoLoginPublico(id: string | null): Promise<{
  meta: { nombreOriginal: string; mime: string };
  bytes: Buffer;
}> {
  const vigentes = await avisosLoginVigentes();
  const aviso = id === null ? vigentes[0] : vigentes.find((a) => a.id === id);
  if (aviso === undefined) throw new NotFoundError("No hay aviso de login publicado.");
  return descargarArchivo(aviso.fileId);
}
