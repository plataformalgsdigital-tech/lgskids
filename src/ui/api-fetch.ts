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

/** Adonde va quien tiene pendiente cambiar la clave. */
export const RUTA_CAMBIAR_CLAVE = "/panel/cambiar-password";

/**
 * El servidor responde 403 `DEBE_CAMBIAR_PASSWORD` a todo mientras la cuenta
 * tenga pendiente cambiar la clave (tras el alta o un restablecimiento). Ante
 * eso no hay nada que mostrar: se lleva al usuario a cambiarla, desde
 * cualquier pantalla.
 */
export async function irACambiarClaveSiCorresponde(res: Response): Promise<boolean> {
  if (res.status !== 403 || typeof window === "undefined") return false;
  const cuerpo = (await res
    .clone()
    .json()
    .catch(() => null)) as { error?: { code?: string } } | null;
  if (cuerpo?.error?.code !== "DEBE_CAMBIAR_PASSWORD") return false;
  if (window.location.pathname !== RUTA_CAMBIAR_CLAVE) window.location.replace(RUTA_CAMBIAR_CLAVE);
  return true;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init);
  if (res.status === 401) {
    const ok = await refrescarSesion();
    if (ok) {
      res = await fetch(input, init);
    }
  }
  await irACambiarClaveSiCorresponde(res);
  return res;
}
