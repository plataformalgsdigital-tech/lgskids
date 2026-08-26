import { imagenCursoInfoHandler, imagenCursoSubirHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = imagenCursoInfoHandler;
export const POST = imagenCursoSubirHandler;
