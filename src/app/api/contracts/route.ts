import { crearContratoHandler, listarContratosHandler } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const POST = crearContratoHandler;
export const GET = listarContratosHandler;
