import {
  cursoReferenciaDeleteHandler,
  cursoReferenciaGetHandler,
  cursoReferenciaPutHandler,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = cursoReferenciaGetHandler;
export const PUT = cursoReferenciaPutHandler;
export const DELETE = cursoReferenciaDeleteHandler;
