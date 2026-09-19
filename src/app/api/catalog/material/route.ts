import {
  materialEliminarHandler,
  materialEstadoHandler,
  materialSubirHandler,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = materialEstadoHandler;
export const POST = materialSubirHandler;
export const DELETE = materialEliminarHandler;
