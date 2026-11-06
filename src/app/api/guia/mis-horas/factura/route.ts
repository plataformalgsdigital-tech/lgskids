import { bootstrapIdentity } from "@/modules/identity";
import { subirFacturaHandler } from "@/modules/intake";

bootstrapIdentity();

export const dynamic = "force-dynamic";

// La lectura con IA en LGS puede tardar: se espera su respuesta antes de contestar.
export const maxDuration = 120;

export const POST = subirFacturaHandler;
