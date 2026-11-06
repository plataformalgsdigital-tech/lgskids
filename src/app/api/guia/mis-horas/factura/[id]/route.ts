import { bootstrapIdentity } from "@/modules/identity";
import { archivoFacturaHandler } from "@/modules/intake";

bootstrapIdentity();

export const dynamic = "force-dynamic";

export const GET = archivoFacturaHandler;
