/**
 * fetch para el cliente con REFRESH silencioso: si el access token expiró
 * (401), intenta rotar el refresh token una vez y reintenta la petición.
 * Así la sesión no se cae a los 15 min mientras el refresh (30 días) viva.
 * Solo si el refresh también falla se considera sesión perdida.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init);
  if (res.status === 401) {
    const refresh = await fetch("/api/auth/refresh", { method: "POST" });
    if (refresh.ok) {
      res = await fetch(input, init);
    }
  }
  return res;
}
