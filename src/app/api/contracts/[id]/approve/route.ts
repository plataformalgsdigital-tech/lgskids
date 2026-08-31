import { aprobarContratoHandler } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const POST = aprobarContratoHandler;
