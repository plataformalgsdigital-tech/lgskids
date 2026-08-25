import { bootstrapIdentity } from "@/modules/identity";
import { regenerarHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const POST = regenerarHandler;
