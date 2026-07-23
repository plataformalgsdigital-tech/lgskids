/**
 * Tiempo y zonas horarias — reglas de la plataforma (ADR-0007):
 *
 * 1. Todo instante se GUARDA en UTC (`timestamptz`).
 * 2. La semántica de día/semana/mes se ancla a la ZONA OPERATIVA del salón
 *    (configurable por salón; default en env). Nunca a la zona del navegador.
 * 3. La interfaz MUESTRA siempre en la hora local del usuario: el niño de
 *    Bogotá ve 5:00 PM y el de Santiago 6:00 PM para la MISMA sesión.
 * 4. Las agrupaciones de reportes se hacen en SQL con `AT TIME ZONE`, no aquí.
 *
 * Implementado sobre `Intl` (zoneinfo del sistema): correcto ante horario de
 * verano chileno sin dependencias externas.
 */

export const OPERATIONAL_TIMEZONES = {
  CL: "America/Santiago",
  CO: "America/Bogota",
  EC: "America/Guayaquil",
  PE: "America/Lima",
} as const;

export type CountryCode = keyof typeof OPERATIONAL_TIMEZONES;

export const COUNTRY_CODES = Object.keys(OPERATIONAL_TIMEZONES) as CountryCode[];

export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute?: number;
  second?: number;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

/** Descompone un instante UTC en la pared de reloj de `timeZone`. */
export function utcToZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter(timeZone).formatToParts(instant)) {
    if (type !== "literal") {
      parts[type] = Number(value);
    }
  }
  // Intl con hour12:false puede producir "24" para medianoche.
  const hour = parts["hour"] === 24 ? 0 : (parts["hour"] ?? 0);
  return {
    year: parts["year"] ?? 0,
    month: parts["month"] ?? 0,
    day: parts["day"] ?? 0,
    hour,
    minute: parts["minute"] ?? 0,
    second: parts["second"] ?? 0,
  };
}

/** Desfase (ms) de `timeZone` respecto de UTC en un instante dado. */
function timeZoneOffsetMs(timeZone: string, instant: Date): number {
  const p = utcToZonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/**
 * Convierte una hora de pared en `timeZone` al instante UTC.
 *
 * Ejemplo: martes 18:00 en America/Santiago → 21:00Z en verano chileno (UTC-3)
 * y 22:00Z en invierno (UTC-4). La doble iteración resuelve los bordes de
 * cambio de horario.
 */
export function wallTimeToUtc(wall: WallTime, timeZone: string): Date {
  const utcGuess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute ?? 0,
    wall.second ?? 0,
  );
  let offset = timeZoneOffsetMs(timeZone, new Date(utcGuess));
  let instant = utcGuess - offset;
  offset = timeZoneOffsetMs(timeZone, new Date(instant));
  instant = utcGuess - offset;
  return new Date(instant);
}

/**
 * Fecha operativa (`YYYY-MM-DD`) de un instante, según la zona operativa.
 * Es la que decide "a qué día pertenece" una sesión en listados del servidor.
 * (Los reportes agregados van por SQL con AT TIME ZONE.)
 */
export function operationalDate(instant: Date, timeZone: string): string {
  const p = utcToZonedParts(instant, timeZone);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}

/** Día de la semana (0=domingo … 6=sábado) de un instante en la zona operativa. */
export function operationalDayOfWeek(instant: Date, timeZone: string): number {
  const p = utcToZonedParts(instant, timeZone);
  // Truco: construir la fecha de pared como UTC solo para obtener el día de semana.
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Valida que una zona IANA exista en el runtime. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}
