import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Falla de un envío de mensajes DENTRO de una petición: quien envía (el sender de
 * WhatsApp) la anota aquí y `handler()` la devuelve en una cabecera, para que la
 * pantalla —sea cual sea— muestre el modal con la CAUSA sin que cada ruta tenga que
 * acordarse. Es transversal y no sabe de negocio: solo lleva un texto.
 */
export const CABECERA_FALLA_ENVIO = "x-whatsapp-falla";

const almacen = new AsyncLocalStorage<{ falla?: string }>();

/** Corre `fn` con un espacio para anotar la falla de esa petición. */
export function conCapturaDeFalla<T>(fn: () => Promise<T>): Promise<T> {
  return almacen.run({}, fn);
}

/** Anota la causa (solo la primera de la petición). Fuera de una petición no hace nada. */
export function notificarFalla(causa: string): void {
  const s = almacen.getStore();
  if (s !== undefined && s.falla === undefined) s.falla = causa;
}

/** Valor listo para la cabecera (ASCII, acotado), o undefined si no hubo falla. */
export function fallaParaCabecera(): string | undefined {
  const falla = almacen.getStore()?.falla;
  return falla === undefined ? undefined : encodeURIComponent(falla.slice(0, 500));
}
