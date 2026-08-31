import { onholdHandler } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const POST = onholdHandler;
