import { imagenesAsignadasHandler } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

/** GET — todo el arte curricular vigente, para descargarlo de una vez. */
export const GET = imagenesAsignadasHandler;
