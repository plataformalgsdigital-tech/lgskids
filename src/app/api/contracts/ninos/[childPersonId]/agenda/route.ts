import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { agendaDeNino, agendarParaNino, opcionesAgendaNino } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { ETIQUETA_TIPO_AGENDA, TIPOS_AGENDA } from "@/modules/scheduling";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * AGENDAR desde la ficha del niño (Academic management).
 *
 * GET — lo agendado y su Welcome; con `?tipo=&fecha=` además lo que se le puede
 * agendar ese día (llenos y choques marcados). POST — agenda. El sobrecupo exige
 * su propia opción (`op.kids.agendar_sobrecupo`), leída de la SESIÓN.
 */
export const GET = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MATRICULAS_GESTIONAR);
  profile.requireOpcion("op.kids.agendar");
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  const q = request.nextUrl.searchParams;
  const tipo = q.get("tipo");
  const fecha = q.get("fecha");
  return json({
    ...(await agendaDeNino(childPersonId, auth.countryScope)),
    tipos: TIPOS_AGENDA.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO_AGENDA[t] })),
    puedeSobrecupo: profile.hasPermission("op.kids.agendar_sobrecupo"),
    ...(tipo !== null &&
      fecha !== null && {
        opciones: await opcionesAgendaNino({
          childPersonId,
          countryScope: auth.countryScope,
          tipo: z.enum(TIPOS_AGENDA).parse(tipo),
          fecha: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .parse(fecha),
        }),
      }),
  });
});

const agendarSchema = z.object({
  tipo: z.enum(TIPOS_AGENDA),
  id: z.uuid(),
  autorizarSobrecupo: z.boolean().default(false),
});

export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.MATRICULAS_GESTIONAR);
  profile.requireOpcion("op.kids.agendar");
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  const body = agendarSchema.parse(await request.json());
  return json(
    await agendarParaNino({
      actorUserId: auth.userId,
      childPersonId,
      countryScope: auth.countryScope,
      tipo: body.tipo,
      id: body.id,
      autorizarSobrecupo: body.autorizarSobrecupo,
      puedeSobrecupo: profile.hasPermission("op.kids.agendar_sobrecupo"),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
    { status: 201 },
  );
});
