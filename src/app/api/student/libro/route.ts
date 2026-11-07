import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { sincronizarLibroAlumno } from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { ValidationError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";
import { alcanceDelAlumno } from "../material/alcance";

bootstrapIdentity();

/** Lo que manda el panel: el almacén del libro tal cual (texto → texto). */
const esquema = z.object({
  nivel: z.string().min(3).max(20),
  datos: z.record(z.string().max(100), z.string().max(1_000_000)),
});

/**
 * POST /api/student/libro — lo que el libro del niño guardó.
 *
 * El niño sale de la SESIÓN (nunca del cuerpo) y el nivel tiene que ser uno que
 * alcanzó, como para abrir el libro. Se guarda su avance como registro y se
 * registra cada proyecto entregado que cumpla la regla. Responde con lo que el
 * libro debe tener ahora (entregas registradas y revisiones del guía), que el
 * panel le pasa a la pestaña abierta.
 */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.PANEL_ALUMNO);
  const body = esquema.parse(await request.json());
  const { personaId, curso, alcanzados } = await alcanceDelAlumno(auth.userId);
  const nivel = body.nivel.toUpperCase();
  if (!alcanzados.includes(nivel)) throw new ValidationError("Ese libro todavía no está abierto.");
  const r = await sincronizarLibroAlumno({
    childPersonId: personaId,
    curso,
    nivel,
    datos: body.datos,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return json({
    inyectar: r.inyectar,
    pasaporte: r.pasaporte,
    registradas: r.registradas,
    rechazadas: r.rechazadas,
  });
});
