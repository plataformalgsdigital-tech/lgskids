import { crearAdultoHandler, listarPersonasHandler } from "@/modules/people";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const POST = crearAdultoHandler;
export const GET = listarPersonasHandler;
