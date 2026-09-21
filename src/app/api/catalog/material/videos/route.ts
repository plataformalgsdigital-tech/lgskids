import { videosLibroListarHandler, videosLibroSubirHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

export const GET = videosLibroListarHandler;
export const POST = videosLibroSubirHandler;
