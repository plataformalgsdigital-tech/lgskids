/**
 * fetch para el cliente con REFRESH silencioso: si el access token expiró
 * (401), intenta rotar el refresh token una vez y reintenta la petición.
 * Así la sesión no se cae a los 15 min mientras el refresh (30 días) viva.
 * Solo si el refresh también falla se considera sesión perdida.
 *
 * COALESCE del refresh: si varias peticiones reciben 401 a la vez (p. ej. una
 * página que hace `Promise.all` de varios apiFetch), TODAS comparten UNA sola
 * llamada a `/api/auth/refresh`. Sin esto, dos refresh concurrentes presentan
 * el mismo refresh token → la detección de reuso rotativo revoca la familia y
 * la sesión se cae (síntoma: 401 en ráfaga y datos que "desaparecen").
 */
let refrescoEnCurso: Promise<boolean> | null = null;

function refrescarSesion(): Promise<boolean> {
  if (refrescoEnCurso === null) {
    refrescoEnCurso = fetch("/api/auth/refresh", { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refrescoEnCurso = null;
      });
  }
  return refrescoEnCurso;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init);
  if (res.status === 401) {
    const ok = await refrescarSesion();
    if (ok) {
      res = await fetch(input, init);
    }
  }
  return res;
}
