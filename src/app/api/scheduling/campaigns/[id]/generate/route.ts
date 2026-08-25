import { bootstrapIdentity } from "@/modules/identity";
import { generarSalonesHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const POST = generarSalonesHandler;
