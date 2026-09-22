import type { NextRequest } from "next/server";
import { getAccessProfile } from "@/modules/access";
import { DebeCambiarPasswordError, UnauthorizedError } from "@/platform/errors";
import {
  registerAuthenticator,
  type AuthContext,
  type Authenticator,
} from "@/platform/http/handler";
import { ACCESS_COOKIE } from "../api/cookies";
import { tokenService, userRepository } from "./composition";

/**
 * Lo único que una sesión con "debe cambiar clave" puede usar: saber quién es
 * (el panel lo necesita para mandarlo a cambiarla) y cambiarla. Salir y
 * refrescar la sesión no pasan por aquí (no exigen autenticación).
 */
const PERMITIDAS_CON_CLAVE_PENDIENTE = new Set(["/api/auth/me", "/api/auth/change-password"]);

/**
 * Autenticador real de la plataforma: valida el access token (header
 * Authorization: Bearer o cookie), verifica que el usuario siga ACTIVO y
 * resuelve roles + alcance por país desde el módulo access.
 *
 * Un usuario inactivado deja de pasar por aquí aunque su JWT siga vigente
 * unos minutos: la cascada de inactivación revoca los refresh y el estado
 * se verifica en cada request.
 */
class IdentityAuthenticator implements Authenticator {
  async authenticate(request: NextRequest): Promise<AuthContext> {
    const header = request.headers.get("authorization");
    const bearer = header?.startsWith("Bearer ") === true ? header.slice(7) : null;
    const cookie = request.cookies.get(ACCESS_COOKIE)?.value ?? null;
    const token = bearer ?? cookie;
    if (token === null || token === "") {
      throw new UnauthorizedError("Debes iniciar sesión.");
    }

    const claims = await tokenService.verifyAccessToken(token);

    const user = await userRepository.findById(claims.userId);
    if (user === null || user.estado !== "ACTIVO") {
      throw new UnauthorizedError("La cuenta no está activa.");
    }
    // "Debe cambiar clave" se hace cumplir AQUÍ, en cada petición. Antes solo
    // lo miraba la pantalla de login, y bastaba ir directo a /panel o /mi-panel
    // para seguir con la clave generada (o la restablecida) sin cambiarla.
    if (user.debeCambiarPassword && !PERMITIDAS_CON_CLAVE_PENDIENTE.has(request.nextUrl.pathname)) {
      throw new DebeCambiarPasswordError("Debes cambiar tu clave antes de continuar.");
    }

    const profile = await getAccessProfile(user.id);
    return {
      userId: user.id,
      roles: profile.roleCodes,
      countryScope: profile.countryScope,
    };
  }
}

let registered = false;

/** Registra el autenticador en platform/http. Idempotente. */
export function bootstrapIdentity(): void {
  if (!registered) {
    registerAuthenticator(new IdentityAuthenticator());
    registered = true;
  }
}
