import { cambioAcademicoHandler } from "@/modules/enrollment";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const POST = cambioAcademicoHandler;
