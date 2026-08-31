/**
 * Enlaces de sala de Zoom.
 *
 * Portado de MOSAICO, que ya se quemó con esto: si al guía se le guarda el
 * enlace de CHAT o su tarjeta de contacto en vez de la sala, al alumno se le
 * abre "Enviar solicitud de contacto" y se queda fuera de la clase. Por eso el
 * enlace se normaliza y se valida antes de guardarlo, no al usarlo.
 */

const HOST_ZOOM = /^https?:\/\/[^/]*zoom\.us/i;

/**
 * Deja el enlace en su forma canónica:
 *  - quita el `#success` que Zoom añade al volver de abrir la app;
 *  - convierte el enlace de ANFITRIÓN (`/s/123`) en el de invitado (`/j/123`),
 *    que apunta a la misma reunión pero sí deja entrar a los alumnos.
 */
export function normalizarSalaZoom(raw: unknown): string {
  const url = String(raw ?? "").trim();
  if (url === "") return "";
  const limpio = url.replace(/#success$/i, "");
  return limpio.replace(/(\/\/[^/]*zoom\.us)\/s\/(\d+)/i, "$1/j/$2");
}

/** ¿Es un enlace por el que un alumno puede entrar a la clase? */
export function esSalaZoomValida(url: unknown): boolean {
  const u = normalizarSalaZoom(url);
  if (u === "" || !HOST_ZOOM.test(u)) return false;
  const ruta = u.replace(HOST_ZOOM, "");
  return /^\/j\/\d+/i.test(ruta) || /^\/my\/[^/?#]+/i.test(ruta);
}

export const MENSAJE_ZOOM_INVALIDO =
  "El enlace debe ser el de la SALA (…zoom.us/j/NÚMERO o …zoom.us/my/NOMBRE). " +
  "El enlace de chat o de contacto no sirve: al alumno le abre “Enviar solicitud de contacto” en vez de la clase.";
