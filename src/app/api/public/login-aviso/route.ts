import { avisoLoginPublicoHandler } from "@/modules/catalog";

// PÚBLICA a propósito: la consume /login, que aún no tiene sesión.
export const GET = avisoLoginPublicoHandler;
