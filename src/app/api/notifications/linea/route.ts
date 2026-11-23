import { bootstrapIdentity } from "@/modules/identity";
import { lineaEstadoHandler } from "@/modules/notifications";

bootstrapIdentity();

export const GET = lineaEstadoHandler;
