import {
  avisoLoginActivarHandler,
  avisoLoginAgregarHandler,
  avisoLoginEstadoHandler,
  avisoLoginQuitarHandler,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = avisoLoginEstadoHandler;
export const PATCH = avisoLoginActivarHandler;
export const POST = avisoLoginAgregarHandler;
export const DELETE = avisoLoginQuitarHandler;
