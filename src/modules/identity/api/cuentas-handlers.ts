import { z } from "zod";
import { PERMISOS, ROLES, getAccessProfile } from "@/modules/access";
import { ForbiddenError, ValidationError } from "@/platform/errors";
import { handler, handlerWithAuth, json } from "@/platform/http/handler";
import { crearUsuarioStaff } from "../application/crear-usuario";
import {
  actualizarFichaAdministrativo,
  cambiarEstadoCuenta,
  consultarClave,
  eliminarCuenta,
  fijarDebeCambiarClave,
  restablecerClave,
} from "../application/gestion-cuentas";
import { MAX_USUARIOS_LISTA, TIPOS_USUARIO, listarUsuarios } from "../application/listar-usuarios";
import {
  descartarSolicitudClave,
  listarSolicitudesClave,
  registrarSolicitudClave,
} from "../application/solicitudes-clave";
import { bootstrapIdentity } from "../infrastructure/authenticator";
import { clientIp } from "./cookies";

bootstrapIdentity();

/** Una clave en la respuesta nunca debe quedar en ninguna caché. */
const SIN_CACHE = { headers: { "Cache-Control": "no-store" } };

type Contexto = { params: Promise<Record<string, string | string[]>> };
async function idDe(context: Contexto): Promise<string> {
  return z.uuid().parse((await context.params)["id"]);
}

/**
 * El actor puede administrar la cuenta de `userId` si le alcanza para su rol
 * más alto (ver `requisitoParaGestionarCuenta`): así un coordinador no puede
 * restablecer la clave de un admin y entrar como él.
 */
async function exigirGestionarCuenta(actorId: string, userId: string) {
  const [actor, otro] = await Promise.all([getAccessProfile(actorId), getAccessProfile(userId)]);
  actor.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  actor.requirePuedeGestionarCuentaDe(otro.roleCodes);
  return actor;
}

// —— Usuarios ————————————————————————————————————————————————————————————

/**
 * Roles que NO se dan de alta como administrativo: cada uno tiene su propio
 * camino, que además llena su ficha (el guía, en su tarjeta con foto y Zoom;
 * el alumno nace al aprobar su contrato — regla 5).
 */
const ROLES_CON_ALTA_PROPIA = new Set<string>([ROLES.GUIA, ROLES.ALUMNO, ROLES.APODERADO]);

const crearSchema = z.object({
  roleCode: z.string().min(3).max(30),
  countryCode: z.string().length(2).nullish(),
  nombres: z.string().trim().min(1).max(80),
  apellidos: z.string().trim().min(1).max(80),
  email: z.email(),
  telefono: z.string().max(30).nullish(),
  docNumero: z.string().max(40).nullish(),
});

/**
 * POST /api/identity/users — alta de un ADMINISTRATIVO con su ficha. Usuario y
 * clave se GENERAN (no se reciben) y se devuelven UNA vez.
 */
export const usuarioCrearHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  const body = crearSchema.parse(await request.json());
  if (ROLES_CON_ALTA_PROPIA.has(body.roleCode)) {
    throw new ValidationError(
      body.roleCode === ROLES.GUIA
        ? "El guía se da de alta en su propia tarjeta, con su ficha, foto y sala de Zoom."
        : "La cuenta del alumno nace al aprobar su contrato.",
    );
  }
  // El rol inicial pasa por la MISMA regla que asignarlo después: antes
  // `usuarios.gestionar` bastaba para crear un admin o un superadmin.
  profile.requirePuedeOtorgarRol(body.roleCode);
  const resultado = await crearUsuarioStaff({
    actorUserId: auth.userId,
    nombres: body.nombres,
    apellidos: body.apellidos,
    email: body.email,
    telefono: body.telefono ?? null,
    docNumero: body.docNumero ?? null,
    roleCode: body.roleCode,
    countryCode: body.countryCode?.toUpperCase() ?? null,
    ip: clientIp(request),
  });
  return json(resultado, { status: 201, ...SIN_CACHE });
});

const listarSchema = z.object({
  buscar: z.string().max(60).optional(),
  tipo: z.enum(TIPOS_USUARIO).optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_USUARIOS_LISTA).optional(),
});

/** GET /api/identity/users?buscar=&tipo=&estado=&limit= — usuarios con sus roles. */
export const usuariosListarHandler = handlerWithAuth(async (request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  const q = listarSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return json({
    usuarios: await listarUsuarios({
      ...(q.buscar !== undefined && { buscar: q.buscar }),
      ...(q.tipo !== undefined && { tipo: q.tipo }),
      ...(q.estado !== undefined && { estado: q.estado }),
      ...(q.limit !== undefined && { limit: q.limit }),
    }),
    limite: q.limit ?? 100,
    // Solo decide si la pantalla muestra "Ver clave"; el servidor lo vuelve a
    // exigir al consultar.
    puedeVerClaves: profile.esSuperadmin,
  });
});

const actualizarSchema = z.object({
  debeCambiarPassword: z.boolean().optional(),
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional(),
  ficha: z
    .object({
      nombres: z.string().trim().min(1).max(80),
      apellidos: z.string().trim().min(1).max(80),
      email: z.email().nullish().or(z.literal("")),
      telefono: z.string().max(30).nullish(),
      docNumero: z.string().max(40).nullish(),
    })
    .optional(),
});

/**
 * PATCH /api/identity/users/[id] — { debeCambiarPassword?, estado?, ficha? }.
 * La ficha es la del ADMINISTRATIVO; alumno y guía se editan en la suya.
 */
export const usuarioActualizarHandler = handlerWithAuth(async (request, auth, context) => {
  const userId = await idDe(context);
  await exigirGestionarCuenta(auth.userId, userId);
  const body = actualizarSchema.parse(await request.json());
  const ip = clientIp(request);
  if (body.ficha !== undefined) {
    await actualizarFichaAdministrativo({
      actorUserId: auth.userId,
      userId,
      nombres: body.ficha.nombres,
      apellidos: body.ficha.apellidos,
      email: body.ficha.email || null,
      telefono: body.ficha.telefono ?? null,
      docNumero: body.ficha.docNumero ?? null,
      ip,
    });
  }
  if (body.debeCambiarPassword !== undefined) {
    await fijarDebeCambiarClave({
      actorUserId: auth.userId,
      userId,
      valor: body.debeCambiarPassword,
      ip,
    });
  }
  if (body.estado !== undefined) {
    await cambiarEstadoCuenta({ actorUserId: auth.userId, userId, estado: body.estado, ip });
  }
  return json({ ok: true });
});

/**
 * DELETE /api/identity/users/[id] — solo una cuenta SIN historia; con
 * historia responde 409 con los motivos y hay que inactivarla.
 */
export const usuarioEliminarHandler = handlerWithAuth(async (request, auth, context) => {
  const userId = await idDe(context);
  await exigirGestionarCuenta(auth.userId, userId);
  await eliminarCuenta({ actorUserId: auth.userId, userId, ip: clientIp(request) });
  return json({ ok: true });
});

/**
 * POST /api/identity/users/[id]/restablecer-clave — clave nueva generada
 * (se devuelve UNA vez) y "debe cambiar clave" encendido.
 */
export const usuarioRestablecerClaveHandler = handlerWithAuth(async (request, auth, context) => {
  const userId = await idDe(context);
  await exigirGestionarCuenta(auth.userId, userId);
  return json(
    await restablecerClave({ actorUserId: auth.userId, userId, ip: clientIp(request) }),
    SIN_CACHE,
  );
});

/**
 * GET /api/identity/users/[id]/clave — consulta la clave. SOLO el ROL
 * superadmin (ningún permiso editable en el panel la concede) y queda
 * auditada.
 */
export const usuarioConsultarClaveHandler = handlerWithAuth(async (request, auth, context) => {
  const userId = await idDe(context);
  const profile = await getAccessProfile(auth.userId);
  if (!profile.esSuperadmin) {
    throw new ForbiddenError("Solo el superadmin puede consultar claves.");
  }
  return json(
    await consultarClave({ actorUserId: auth.userId, userId, ip: clientIp(request) }),
    SIN_CACHE,
  );
});

// —— Olvidé mi clave ————————————————————————————————————————————————————

/**
 * POST /api/public/olvido-clave — pública. Responde SIEMPRE lo mismo, exista
 * o no el usuario: la puerta no sirve para averiguar qué cuentas hay.
 */
export const olvidoClaveHandler = handler(async (request) => {
  const body = z
    .object({
      usuario: z.string().trim().min(1).max(60),
      contacto: z.string().max(200).nullish(),
    })
    .parse(await request.json());
  await registrarSolicitudClave({
    usuario: body.usuario,
    contacto: body.contacto ?? null,
    ip: clientIp(request),
  });
  return json(
    {
      mensaje:
        "Recibimos tu solicitud. El equipo de LGS Kids te contactará con una clave nueva; al entrar con ella te pediremos que la cambies.",
    },
    { status: 202 },
  );
});

/** GET /api/identity/solicitudes-clave — pendientes. */
export const solicitudesClaveListarHandler = handlerWithAuth(async (_request, auth) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  return json({ solicitudes: await listarSolicitudesClave() });
});

/** POST /api/identity/solicitudes-clave/[id]/descartar */
export const solicitudClaveDescartarHandler = handlerWithAuth(async (_request, auth, context) => {
  const profile = await getAccessProfile(auth.userId);
  profile.requirePermission(PERMISOS.USUARIOS_GESTIONAR);
  await descartarSolicitudClave({ actorUserId: auth.userId, id: await idDe(context) });
  return json({ ok: true });
});
