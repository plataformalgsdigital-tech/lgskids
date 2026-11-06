import { bootstrapIdentity } from "@/modules/identity";
import { archivoFacturaHandler, quitarFacturaHandler } from "@/modules/intake";

bootstrapIdentity();

export const dynamic = "force-dynamic";

export const GET = archivoFacturaHandler;
export const DELETE = quitarFacturaHandler;
