import { avisoLoginImagenHandler } from "@/modules/catalog";

// PÚBLICA a propósito. No recibe id: resuelve sola el aviso vigente y solo
// responde si está prendido.
export const GET = avisoLoginImagenHandler;
