import { z } from "zod";
import { PERMISOS, getAccessProfile } from "@/modules/access";
import {
  AREAS,
  CANALES,
  ESTADOS,
  RESULTADOS,
  agregarContacto,
  agregarNota,
  asignarCaso,
  cerrarCaso,
  detalleCaso,
  guardarGestion,
} from "@/modules/casos";
import { bootstrapIdentity } from "@/modules/identity";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD.");

/** GET — el caso completo (marca sus reportes como leídos). `casos.ver`. */
export const GET = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CASOS_VER);
  const id = z.uuid().parse((await context.params)["id"]);
  return json({
    caso: await detalleCaso(id, { actorUserId: auth.userId, countryScope: auth.countryScope }),
    puedeGestionar: profile.hasPermission(PERMISOS.CASOS_GESTIONAR),
  });
});

const accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("asignar"), area: z.enum(AREAS), comentario: z.string().max(2000) }),
  z.object({
    accion: z.literal("cerrar"),
    estado: z.enum(ESTADOS),
    conclusion: z.string().max(2000),
    noContinua: z.boolean().default(false),
    acuerdo: z.string().max(2000).nullish(),
    fechaCompromiso: fecha.nullish(),
  }),
  z.object({
    accion: z.literal("gestion"),
    acuerdo: z.string().max(2000).nullish(),
    fechaCompromiso: fecha.nullish().or(z.literal("")),
    responsable: z.string().max(200).nullish(),
  }),
  z.object({
    accion: z.literal("contacto"),
    canal: z.enum(CANALES),
    resultado: z.enum(RESULTADOS),
    observacion: z.string().max(2000).nullish(),
  }),
  z.object({ accion: z.literal("nota"), texto: z.string().max(2000) }),
]);

/** POST — gestionar el caso: asignar, cerrar, acuerdo, contacto o nota. `casos.gestionar`. */
export const POST = handlerWithAuth(async (request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.CASOS_GESTIONAR);
  const casoId = z.uuid().parse((await context.params)["id"]);
  const body = accion.parse(await request.json());
  const base = { actorUserId: auth.userId, casoId, countryScope: auth.countryScope };
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  switch (body.accion) {
    case "asignar":
      await asignarCaso({ ...base, area: body.area, comentario: body.comentario, ip });
      break;
    case "cerrar":
      await cerrarCaso({
        ...base,
        estado: body.estado,
        conclusion: body.conclusion,
        noContinua: body.noContinua,
        acuerdo: body.acuerdo ?? null,
        fechaCompromiso: body.fechaCompromiso ?? null,
        ip,
      });
      break;
    case "gestion":
      await guardarGestion({
        ...base,
        acuerdo: body.acuerdo,
        fechaCompromiso: body.fechaCompromiso === "" ? null : body.fechaCompromiso,
        responsable: body.responsable,
      });
      break;
    case "contacto":
      await agregarContacto({
        ...base,
        canal: body.canal,
        resultado: body.resultado,
        observacion: body.observacion ?? null,
      });
      break;
    case "nota":
      await agregarNota({ ...base, texto: body.texto });
      break;
  }
  return json({
    caso: await detalleCaso(casoId, { actorUserId: auth.userId, countryScope: auth.countryScope }),
  });
});
