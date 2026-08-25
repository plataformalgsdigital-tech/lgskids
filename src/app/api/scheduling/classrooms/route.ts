import { bootstrapIdentity } from "@/modules/identity";
import { crearSalonHandler, listarSalonesHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const POST = crearSalonHandler;
export const GET = listarSalonesHandler;
