import { bootstrapIdentity } from "@/modules/identity";
import { alcanceCambioGuiaHandler, cambiarGuiaHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const GET = alcanceCambioGuiaHandler;
export const POST = cambiarGuiaHandler;
