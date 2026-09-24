import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { listaDeSesion, verificarAccesoGuia } from "@/modules/attendance";
import {
  NIVELES,
  PARADAS,
  autorizarMisiones,
  etiquetaParada,
  misionesDeNinos,
  nivelDeNino,
  revocarMision,
} from "@/modules/catalog";
import { bootstrapIdentity } from "@/modules/identity";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * MISIONES DE LA SESIÓN: el guía abre en clase la unidad que están trabajando
 * —evaluación, juego y souvenir— a los niños de SU sesión.
 *
 * Mismo permiso y mismo alcance que pasar lista (`verificarAccesoGuia`): quien
 * puede marcar la asistencia de esa sesión puede abrirle la misión a su grupo.
 * El NIVEL no se recibe: lo resuelve el servidor, el de cada niño.
 */

type Contexto = { params: Promise<Record<string, string | string[]>> };

async function sesionDe(context: Contexto): Promise<string> {
  return z.uuid().parse((await context.params)["sessionId"]);
}

function ip(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** El guía solo sobre SUS sesiones; coordinación, sobre cualquiera. */
async function exigirAcceso(sessionId: string, userId: string) {
  const profile = await getAccessProfile(userId);
  profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
  await verificarAccesoGuia(sessionId, {
    userId,
    puedeGestionarCualquierSalon: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
  });
}

/**
 * GET — qué tiene abierto cada niño de la sesión, y con qué se puede abrir.
 *
 * Con `?conNiveles=1` añade el nivel que trabaja cada niño, para sugerir el de
 * la clase. Va aparte porque hay que preguntárselo a la progresión niño por
 * niño, y eso solo hace falta cuando el guía va a abrir una misión.
 */
export const GET = handlerWithAuth(async (request, auth, context) => {
  const sessionId = await sesionDe(context as Contexto);
  await exigirAcceso(sessionId, auth.userId);
  const { lista } = await listaDeSesion(sessionId);
  const misiones = await misionesDeNinos(lista.map((f) => f.childPersonId));
  const conNiveles = request.nextUrl.searchParams.get("conNiveles") === "1";

  return json({
    // El nombre de cada parada va escrito desde aquí: la pantalla no repite la
    // regla de "la 0 se llama Welcome".
    misiones: misiones.map((m) => ({ ...m, etiqueta: etiquetaParada(m.parada) })),
    paradas: PARADAS.map((parada) => ({ parada, etiqueta: etiquetaParada(parada) })),
    niveles: NIVELES.map((n) => ({ codigo: n.codigo, nombre: n.nombre })),
    ...(conNiveles && {
      ninos: await Promise.all(
        lista.map(async (f) => ({
          childPersonId: f.childPersonId,
          nivel: (await nivelDeNino(f.childPersonId))?.actual ?? null,
        })),
      ),
    }),
  });
});

const abrirSchema = z.object({
  parada: z.coerce.number().int(),
  /** Nivel de la clase; si falta, el que cada niño está trabajando. */
  nivel: z.string().min(1).max(30).nullish(),
  /** Los niños elegidos; por defecto, toda la lista de la sesión. */
  childPersonIds: z.array(z.uuid()).optional(),
});

/** POST — abre una parada a los niños elegidos de la sesión. */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const sessionId = await sesionDe(context as Contexto);
  await exigirAcceso(sessionId, auth.userId);
  const body = abrirSchema.parse(await request.json());

  // Solo niños de ESTA sesión: la lista sale de las matrículas activas, no del
  // cuerpo de la petición.
  const { lista } = await listaDeSesion(sessionId);
  const enSesion = new Set(lista.map((f) => f.childPersonId));
  const elegidos = body.childPersonIds ?? [...enSesion];
  const ajenos = elegidos.filter((id) => !enSesion.has(id));
  if (ajenos.length > 0) {
    throw new ForbiddenError("Esos niños no están en la lista de esta sesión.");
  }

  return json({
    resultados: await autorizarMisiones({
      actorUserId: auth.userId,
      childPersonIds: elegidos,
      parada: body.parada,
      nivel: body.nivel ?? null,
      sessionId,
      ip: ip(request),
    }),
  });
});

const cerrarSchema = z.object({
  childPersonId: z.uuid(),
  curso: z.enum(["JUNIOR", "YOUNGSTER"]),
  nivel: z.string().min(1).max(30),
  parada: z.coerce.number().int(),
});

/** DELETE — cierra una parada que se abrió por error. */
export const DELETE = handlerWithAuth(async (request, auth, context) => {
  const sessionId = await sesionDe(context as Contexto);
  await exigirAcceso(sessionId, auth.userId);
  const body = cerrarSchema.parse(await request.json());

  const { lista } = await listaDeSesion(sessionId);
  if (!lista.some((f) => f.childPersonId === body.childPersonId)) {
    throw new ForbiddenError("Ese niño no está en la lista de esta sesión.");
  }
  await revocarMision({
    actorUserId: auth.userId,
    childPersonId: body.childPersonId,
    curso: body.curso,
    nivel: body.nivel,
    parada: body.parada,
    ip: ip(request),
  });
  return json({ ok: true });
});
