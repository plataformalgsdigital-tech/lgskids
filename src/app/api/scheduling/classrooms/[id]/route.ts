import { bootstrapIdentity } from "@/modules/identity";
import {
  detalleSalonHandler,
  editarSalonHandler,
  eliminarSalonHandler,
} from "@/modules/scheduling";

bootstrapIdentity();

export const GET = detalleSalonHandler;
export const PATCH = editarSalonHandler;
export const DELETE = eliminarSalonHandler;
