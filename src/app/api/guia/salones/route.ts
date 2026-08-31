import { misSalonesHandler } from "@/modules/scheduling";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = misSalonesHandler;
