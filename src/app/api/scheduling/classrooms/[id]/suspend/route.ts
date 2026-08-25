import { bootstrapIdentity } from "@/modules/identity";
import { suspenderHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const POST = suspenderHandler;
