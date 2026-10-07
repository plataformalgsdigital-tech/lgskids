import { bootstrapIdentity } from "@/modules/identity";
import { envioHandler, historialHandler } from "@/modules/notifications";

bootstrapIdentity();

export const GET = historialHandler;
export const POST = envioHandler;
