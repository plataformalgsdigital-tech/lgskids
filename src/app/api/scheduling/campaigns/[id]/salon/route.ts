import { bootstrapIdentity } from "@/modules/identity";
import { agregarSalonHandler } from "@/modules/scheduling";

bootstrapIdentity();

export const POST = agregarSalonHandler;
