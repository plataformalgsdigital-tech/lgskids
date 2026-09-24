import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessProfile } from "@/modules/access";
import {
  actualizarCelda,
  borrarFilas,
  esquemaTabla,
  exportarCsv,
  insertarFila,
  leerFilas,
} from "@/modules/dbadmin";
import { bootstrapIdentity } from "@/modules/identity";
import { ForbiddenError } from "@/platform/errors";
import { handlerWithAuth, json } from "@/platform/http/handler";

bootstrapIdentity();

/**
 * Una tabla: leerla (`GET`), cambiar una celda (`PATCH`), insertar (`POST`) y
 * borrar (`DELETE`).
 *
 * Toda la validación —que la tabla y la columna existan, que la columna no sea
 * una credencial, que la tabla sensible venga confirmada— vive en el módulo
 * `dbadmin`. Aquí solo se comprueba QUIÉN entra y se traduce la petición.
 */

/** El rol superadmin, no un permiso: esto abre la base entera. */
async function exigirSuperadmin(userId: string): Promise<void> {
  const profile = await getAccessProfile(userId);
  if (!profile.esSuperadmin) {
    throw new ForbiddenError("Solo el superadmin puede abrir la base de datos.");
  }
}

const nombreTabla = async (context: {
  params: Promise<Record<string, string | string[]>>;
}): Promise<string> =>
  z
    .string()
    .min(1)
    .max(63)
    .parse((await context.params)["tabla"]);

const ip = (request: Request): string | null =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

/** Un valor de celda tal como viaja en JSON. */
const valor = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const sinCache = { headers: { "Cache-Control": "no-store" } };

export const GET = handlerWithAuth(async (request, auth, context) => {
  await exigirSuperadmin(auth.userId);
  const tabla = await nombreTabla(context);
  const q = request.nextUrl.searchParams;

  // Los filtros llegan como `f.columna=valor`: así no hay que serializar JSON
  // en la URL y una columna inventada la descarta el módulo.
  const filtros: Record<string, string> = {};
  for (const [clave, v] of q.entries()) {
    if (clave.startsWith("f.")) filtros[clave.slice(2)] = v;
  }
  const consulta = {
    tabla,
    pagina: Number(q.get("pagina") ?? "1"),
    tamano: Number(q.get("tamano") ?? "50"),
    ...(q.get("orden") !== null && { orden: q.get("orden") as string }),
    descendente: q.get("dir") === "desc",
    ...(q.get("buscar") !== null && { busqueda: q.get("buscar") as string }),
    filtros,
  };

  if (q.get("formato") === "csv") {
    const csv = await exportarCsv(consulta);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${tabla}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const [esquema, pagina] = await Promise.all([esquemaTabla(tabla), leerFilas(consulta)]);
  return json({ esquema, ...pagina }, sinCache);
});

const patchSchema = z.object({
  id: z.string().min(1),
  columna: z.string().min(1).max(63),
  valor,
  confirmado: z.boolean().optional(),
});

export const PATCH = handlerWithAuth(async (request, auth, context) => {
  await exigirSuperadmin(auth.userId);
  const tabla = await nombreTabla(context);
  const b = patchSchema.parse(await request.json());
  return json(
    {
      fila: await actualizarCelda({
        actorUserId: auth.userId,
        tabla,
        id: b.id,
        columna: b.columna,
        valor: b.valor,
        ...(b.confirmado !== undefined && { confirmado: b.confirmado }),
        ip: ip(request),
      }),
    },
    sinCache,
  );
});

const postSchema = z.object({
  valores: z.record(z.string(), valor),
  confirmado: z.boolean().optional(),
});

export const POST = handlerWithAuth(async (request, auth, context) => {
  await exigirSuperadmin(auth.userId);
  const tabla = await nombreTabla(context);
  const b = postSchema.parse(await request.json());
  return json(
    {
      fila: await insertarFila({
        actorUserId: auth.userId,
        tabla,
        valores: b.valores,
        ...(b.confirmado !== undefined && { confirmado: b.confirmado }),
        ip: ip(request),
      }),
    },
    { status: 201, ...sinCache },
  );
});

const deleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  confirmado: z.boolean().optional(),
});

export const DELETE = handlerWithAuth(async (request, auth, context) => {
  await exigirSuperadmin(auth.userId);
  const tabla = await nombreTabla(context);
  const b = deleteSchema.parse(await request.json());
  return json(
    await borrarFilas({
      actorUserId: auth.userId,
      tabla,
      ids: b.ids,
      ...(b.confirmado !== undefined && { confirmado: b.confirmado }),
      ip: ip(request),
    }),
    sinCache,
  );
});
