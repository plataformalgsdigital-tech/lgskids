import { z } from "zod";
import { getAccessProfile } from "@/modules/access";
import { handler, handlerWithAuth, json } from "@/platform/http/handler";
import { bootstrapIdentity } from "../infrastructure/authenticator";
import { sessionService, userRepository } from "../infrastructure/composition";
import {
  clearSessionCookies,
  clientIp,
  refreshTokenFromRequest,
  setSessionCookies,
} from "./cookies";

// Asegura el autenticador registrado en cualquier proceso que monte estas
// rutas (web, pruebas). Idempotente.
bootstrapIdentity();

const loginSchema = z.object({
  username: z.string().min(3).max(60),
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z.object({
  passwordActual: z.string().min(1).max(200),
  passwordNueva: z.string().min(1).max(200),
});

/** POST /api/auth/login */
export const loginHandler = handler(async (request) => {
  const body = loginSchema.parse(await request.json());
  const { tokens, user } = await sessionService().login({
    username: body.username,
    password: body.password,
    ip: clientIp(request),
  });
  const response = json({ user });
  setSessionCookies(response, tokens);
  return response;
});

/** POST /api/auth/refresh — rota el refresh token (cookie). */
export const refreshHandler = handler(async (request) => {
  const refreshToken = refreshTokenFromRequest(request);
  if (refreshToken === null) {
    const response = json(
      { error: { code: "UNAUTHORIZED", message: "No hay sesión activa." } },
      { status: 401 },
    );
    clearSessionCookies(response);
    return response;
  }
  const { tokens, user } = await sessionService().refresh(refreshToken);
  const response = json({ user });
  setSessionCookies(response, tokens);
  return response;
});

/** POST /api/auth/logout — revoca la familia de sesión. */
export const logoutHandler = handler(async (request) => {
  await sessionService().logout(refreshTokenFromRequest(request));
  const response = json({ ok: true });
  clearSessionCookies(response);
  return response;
});

/** GET /api/auth/me — usuario + roles + permisos (alimenta el menú). */
export const meHandler = handlerWithAuth(async (_request, auth) => {
  const [user, profile] = await Promise.all([
    userRepository.findById(auth.userId),
    getAccessProfile(auth.userId),
  ]);
  return json({
    user:
      user === null
        ? null
        : {
            id: user.id,
            username: user.username,
            email: user.email,
            debeCambiarPassword: user.debeCambiarPassword,
          },
    roles: profile.roles,
    permisos: profile.permissions,
    paises: profile.countryScope,
  });
});

/** POST /api/auth/change-password — revoca todas las sesiones previas. */
export const changePasswordHandler = handlerWithAuth(async (request, auth) => {
  const body = changePasswordSchema.parse(await request.json());
  await sessionService().changePassword({
    userId: auth.userId,
    passwordActual: body.passwordActual,
    passwordNueva: body.passwordNueva,
    ip: clientIp(request),
  });
  const response = json({ ok: true, mensaje: "Contraseña actualizada. Inicia sesión de nuevo." });
  clearSessionCookies(response);
  return response;
});
