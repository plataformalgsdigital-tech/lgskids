import { vozLibroServirHandler } from "@/modules/catalog";

/**
 * Sin `bootstrapIdentity` a propósito: esta ruta NO usa sesión. La pide el
 * libro desde su caja, adonde el navegador no manda la cookie; la autoriza el
 * token firmado de la ruta (ver `vozLibroServirHandler`).
 */
export const GET = vozLibroServirHandler;
