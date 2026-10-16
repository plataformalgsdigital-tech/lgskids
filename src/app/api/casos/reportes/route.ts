import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { TEMAS, exigirReporteDesdeSesion, reportarCaso } from "@/modules/casos";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const cuerpo = z.object({
  childPersonId: z.uuid(),
  texto: z.string().min(5).max(2000),
  tema: z.enum(TEMAS),
  /** Desde la sesión ("Requiere atención"): el reporte es del guía de la sesión. */
  sessionId: z.uuid().nullish(),
  /** Desde la bandeja: a nombre de qué guía, si lo contó un guía. */
  guiaUserId: z.uuid().nullish(),
  /** Con casos abiertos: el id de uno para sumarse, o "NUEVO". */
  destino: z.string().max(40).nullish(),
});

/**
 * POST — reportar un caso de atención.
 *  - Con `sessionId`: el guía desde su sesión (`asistencia.gestionar`, solo sus
 *    sesiones y niños de esa lista). Origen GUIA, a nombre del guía de la sesión.
 *  - Sin `sessionId`: "Adicionar caso" de la bandeja (`casos.gestionar`). Origen
 *    SERVICIO, opcionalmente a nombre de un guía.
 * Si el niño ya tiene casos abiertos y no se eligió `destino`, responde 409 con
 * ellos en `details.casos`.
 */
export const POST = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  const body = cuerpo.parse(await request.json());
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (body.sessionId != null) {
    profile.requirePermission(PERMISOS.ASISTENCIA_GESTIONAR);
    profile.requireOpcion("op.calendario.reportar_caso");
    const { guiaUserId } = await exigirReporteDesdeSesion({
      actorUserId: auth.userId,
      sessionId: body.sessionId,
      childPersonId: body.childPersonId,
      puedeGestionarSalones: profile.hasPermission(PERMISOS.SALONES_GESTIONAR),
    });
    return json(
      await reportarCaso({
        actorUserId: auth.userId,
        childPersonId: body.childPersonId,
        texto: body.texto,
        tema: body.tema,
        origen: "GUIA",
        sessionId: body.sessionId,
        guiaUserId: guiaUserId ?? auth.userId,
        destino: body.destino ?? null,
        // El guía reporta sobre la lista de SU sesión: ese es su alcance.
        countryScope: null,
        ip,
      }),
      { status: 201 },
    );
  }
  profile.requirePermission(PERMISOS.CASOS_GESTIONAR);
  profile.requireOpcion("op.casos.adicionar");
  return json(
    await reportarCaso({
      actorUserId: auth.userId,
      childPersonId: body.childPersonId,
      texto: body.texto,
      tema: body.tema,
      origen: "SERVICIO",
      guiaUserId: body.guiaUserId ?? null,
      destino: body.destino ?? null,
      countryScope: auth.countryScope,
      ip,
    }),
    { status: 201 },
  );
});
