import type { NextRequest } from "next/server";
import { getAccessProfile } from "@/modules/access";
import { UnauthorizedError } from "@/platform/errors";
import {
  registerAuthenticator,
  type AuthContext,
  type Authenticator,
} from "@/platform/http/handler";
import { ACCESS_COOKIE } from "../api/cookies";
import { tokenService, userRepository } from "./composition";

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
