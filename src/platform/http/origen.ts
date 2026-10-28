/**
 * El origen que ve el NAVEGADOR (`https://app.lgskidsplataforma.com`), no el
 * del servidor.
 *
 * `request.nextUrl.origin` NO sirve detrás de un proxy: Next arma esa URL con
 * el nombre y el puerto en que escucha el proceso (`https://localhost:8080` en
 * el contenedor de DigitalOcean). En desarrollo coinciden y por eso no se nota.
 * Pasó con la CSP del libro (2026-10-28): nombraba `localhost:8080` como la
 * única salida y el navegador bloqueaba cada audio del libro.
 *
 * Se lee `x-forwarded-host`/`host` (el proxy lo reenvía) y `x-forwarded-proto`.
 * El nombre se valida: va a parar a una cabecera, y un `;` en él agregaría
 * directivas a la CSP. Si no es válido, se usa el de Next.
 */
const HOST_VALIDO = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function origenPublico(request: { headers: Headers; nextUrl: URL }): string {
  const primero = (v: string | null) => v?.split(",")[0]?.trim() ?? "";
  const host =
    primero(request.headers.get("x-forwarded-host")) || primero(request.headers.get("host"));
  if (!HOST_VALIDO.test(host)) return request.nextUrl.origin;
  const proto = primero(request.headers.get("x-forwarded-proto"));
  const esquema =
    proto === "https" || proto === "http" ? proto : request.nextUrl.protocol.replace(":", "");
  return `${esquema}://${host}`;
}
