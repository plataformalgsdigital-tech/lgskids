import { fotoHandler } from "../route";
import { bootstrapIdentity } from "@/modules/identity";

bootstrapIdentity();

// Foto del alumno logueado. PRIVADA: sin sesión no hay imagen, y la ruta no
// acepta id, así que nadie puede pedir la de otro niño.
export const GET = fotoHandler;
