import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import { datosNinoEditables, editarDatosNino } from "@/modules/contracts";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * "✏️ Editar datos" de la ficha del niño: sus datos personales y los de su
 * apoderado. NO se reciben —ni aunque vengan en el cuerpo— el nombre, el
 * documento ni el usuario del niño, ni nada académico o del contrato: el
 * esquema ni los tiene (ver `datos-nino.ts`).
 *
 * Quién: `personas.gestionar` + la opción `op.kids.editar_datos`, con alcance
 * por país del niño.
 */

async function exigir(userId: string) {
  const profile = await getAccessProfile(userId);
  profile.requirePermission(PERMISOS.PERSONAS_GESTIONAR);
  profile.requireOpcion("op.kids.editar_datos");
}

export const GET = handlerWithAuth(async (_request, auth, context) => {
  await exigir(auth.userId);
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  return json(await datosNinoEditables(childPersonId, auth.countryScope));
});

const texto = (max: number) => z.string().max(max).nullish();
const correo = z
  .union([z.email("Correo inválido."), z.literal("")])
  .nullish()
  .transform((v) => v ?? null);

const schema = z.object({
  nino: z.object({
    fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD."),
    email: correo,
    telefono: texto(25).transform((v) => v ?? null),
  }),
  apoderado: z
    .object({
      nombres: z.string().max(60),
      apellidos: z.string().max(60),
      email: correo,
      telefono: texto(25).transform((v) => v ?? null),
      parentesco: texto(30).transform((v) => v ?? null),
    })
    .nullable(),
});

export const PUT = handlerWithAuth(async (request, auth, context) => {
  await exigir(auth.userId);
  const childPersonId = z.uuid().parse((await context.params)["childPersonId"]);
  const datos = schema.parse(await request.json());
  return json(
    await editarDatosNino({
      actorUserId: auth.userId,
      childPersonId,
      countryScope: auth.countryScope,
      datos,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }),
  );
});
