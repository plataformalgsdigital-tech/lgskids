/**
 * Username autogenerado y correo sintético (ADR-0005, decisión 2026-07-22).
 *
 * El login del niño es SU username (no un correo): hermanos que comparten el
 * correo del papá no colisionan. Cuando el sistema necesita un identificador
 * con forma de correo y el niño no tiene uno propio, se fabrica uno interno
 * NO enrutable bajo @alumnos.lgskidsplataforma.com.
 */

export const DOMINIO_CORREO_SINTETICO = "alumnos.lgskidsplataforma.com";

/** Quita acentos/ñ y todo lo que no sea a-z0-9. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas combinantes: á→a, ñ→n
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Base del username: inicial del primer nombre + primer apellido
 * (ej. "María José" + "García Ñuñez" → "mgarcia"). El sufijo numérico lo
 * agrega quien crea la cuenta hasta encontrar uno libre. Es la misma regla
 * para alumnos y staff (desde 2026-09-21 el staff tampoco elige su usuario);
 * `respaldo` es el prefijo cuando el nombre no deja al menos 2 letras.
 */
export function baseUsername(nombres: string, apellidos: string, respaldo = "alumno"): string {
  const inicial = normalizar(nombres.trim().split(/\s+/)[0] ?? "");
  const apellido = normalizar(apellidos.trim().split(/\s+/)[0] ?? "");
  const base = `${inicial.slice(0, 1)}${apellido}`.slice(0, 20);
  return base.length >= 2 ? base : `${respaldo}${base}`;
}

/** Correo sintético interno (no enrutable) para un username dado. */
export function correoSintetico(username: string): string {
  return `${username}@${DOMINIO_CORREO_SINTETICO}`;
}
