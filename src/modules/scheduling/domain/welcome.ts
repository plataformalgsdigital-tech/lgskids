/**
 * WELCOME: la sesión de bienvenida que el niño agenda al crear su perfil.
 *
 * Reglas puras. La elegibilidad (qué Welcome le sirve a qué niño) vive en UN
 * fragmento SQL de `application/welcome.ts`, que usan por igual la lista que
 * ve el niño y la reserva: si se calcularan aparte, la lista podría ofrecer un
 * Welcome que la reserva después rechaza.
 */

export const NIVELES_WELCOME = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"] as const;
export type NivelWelcome = (typeof NIVELES_WELCOME)[number];

/** El Welcome es para el niño que empieza: por defecto, Rookie. */
export const NIVEL_WELCOME_DEFECTO: NivelWelcome = "ROOKIE";

export const PAISES_WELCOME = ["CL", "CO", "EC", "PE"] as const;
export const CURSOS_WELCOME = ["JUNIOR", "YOUNGSTER"] as const;

export const DURACION_WELCOME_MIN = 15;
export const DURACION_WELCOME_MAX = 300;
export const LIMITE_WELCOME_MAX = 500;

/** Cupos libres; nunca negativo aunque se haya bajado el límite con gente dentro. */
export function cuposLibres(limite: number, inscritos: number): number {
  return Math.max(0, limite - inscritos);
}

/**
 * Valida lo que no depende de la base. Devuelve el mensaje del primer error,
 * o null si todo está bien.
 */
export function validarWelcome(input: {
  fecha: string;
  horaLocal: string;
  duracionMin: number;
  limiteUsuarios: number;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return "La fecha debe ser YYYY-MM-DD.";
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(input.horaLocal)) return "La hora debe ser HH:MM.";
  if (
    !Number.isInteger(input.duracionMin) ||
    input.duracionMin < DURACION_WELCOME_MIN ||
    input.duracionMin > DURACION_WELCOME_MAX
  ) {
    return `La duración debe estar entre ${String(DURACION_WELCOME_MIN)} y ${String(DURACION_WELCOME_MAX)} minutos.`;
  }
  if (
    !Number.isInteger(input.limiteUsuarios) ||
    input.limiteUsuarios < 1 ||
    input.limiteUsuarios > LIMITE_WELCOME_MAX
  ) {
    return `El límite de niños va de 1 a ${String(LIMITE_WELCOME_MAX)}.`;
  }
  return null;
}
