import { bootstrapIdentity } from "@/modules/identity";
import { cambiarGuiaHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const POST = cambiarGuiaHandler;
