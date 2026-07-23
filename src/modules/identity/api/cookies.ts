import type { NextRequest, NextResponse } from "next/server";
import { env } from "@/platform/config/env";
import type { SessionTokens } from "../application/session-service";

/**
 * Cookies de sesión (ADR-0005): HttpOnly + Secure (producción) + SameSite=Lax.
 * - Access: visible en todo el sitio (la usan páginas y API).
 * - Refresh: SOLO viaja a /api/auth (rotación/logout), nunca al resto.
 */
export const ACCESS_COOKIE = "kids_access";
export const REFRESH_COOKIE = "kids_refresh";

function secure(): boolean {
  return env().NODE_ENV === "production";
}

export function setSessionCookies(response: NextResponse, tokens: SessionTokens): void {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    maxAge: tokens.accessExpiresInSeconds,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: tokens.refreshExpiresInDays * 24 * 60 * 60,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, path: "/api/auth", maxAge: 0 });
}

export function refreshTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(REFRESH_COOKIE)?.value ?? null;
}

/** IP del cliente para auditoría y rate limiting. */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded !== "") {
    return forwarded.split(",")[0]?.trim() ?? "desconocida";
  }
  return request.headers.get("x-real-ip") ?? "desconocida";
}
