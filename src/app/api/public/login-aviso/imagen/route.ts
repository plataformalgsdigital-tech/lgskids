import { avisoLoginImagenHandler } from "@/modules/catalog";

// PÚBLICA a propósito. Recibe el id del AVISO (nunca de archivo) y solo
// responde si ese aviso está vigente.
export const GET = avisoLoginImagenHandler;
