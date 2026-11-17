import { materialGuiaPublicoHandler } from "@/modules/catalog";

/**
 * Sin `bootstrapIdentity` a propósito: esta ruta NO usa sesión. La pide Microsoft (Office
 * para la web) desde sus servidores; la autoriza el token firmado de la ruta, que sirve
 * UNA presentación durante una hora (ver `materialGuiaPublicoHandler`).
 */
export const GET = materialGuiaPublicoHandler;
