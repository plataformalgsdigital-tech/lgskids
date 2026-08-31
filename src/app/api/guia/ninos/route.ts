import { misNinosHandler } from "@/modules/scheduling";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = misNinosHandler;
