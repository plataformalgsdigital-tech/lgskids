import { agendaHandler } from "@/modules/scheduling";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = agendaHandler;
