import { detalleSesionHandler } from "@/modules/scheduling";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = detalleSesionHandler;
