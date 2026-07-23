import { SignJWT, jwtVerify } from "jose";
import { env, requireAuthSecret } from "@/platform/config/env";
import { UnauthorizedError } from "@/platform/errors";
import type { AccessTokenClaims, TokenServicePort } from "../application/ports";

const ISSUER = "kids2026";
const AUDIENCE = "kids2026-web";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireAuthSecret());
}

export class JwtTokenService implements TokenServicePort {
  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ username: claims.username })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${env().AUTH_ACCESS_TTL_SECONDS}s`)
      .sign(secretKey());
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, secretKey(), {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (typeof payload.sub !== "string" || typeof payload["username"] !== "string") {
        throw new UnauthorizedError("Token inválido.");
      }
      return { userId: payload.sub, username: payload["username"] };
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError("Sesión inválida o expirada.");
    }
  }
}
