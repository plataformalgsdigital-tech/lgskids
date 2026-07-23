import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_TIMEZONES,
  isValidTimeZone,
  operationalDate,
  operationalDayOfWeek,
  utcToZonedParts,
  wallTimeToUtc,
} from "./index";

/**
 * Estos casos cubren el peor bug histórico de LGS: instantes mal convertidos
 * entre la pared de reloj local y UTC, ante el horario de verano chileno.
 * Chile: UTC-3 en verano austral, UTC-4 en invierno.
 * Colombia/Ecuador/Perú: UTC-5 fijo, sin horario de verano.
 */
describe("wallTimeToUtc", () => {
  it("convierte 18:00 de Santiago en VERANO austral (enero) a 21:00Z (UTC-3)", () => {
    const instant = wallTimeToUtc(
      { year: 2026, month: 1, day: 15, hour: 18 },
      OPERATIONAL_TIMEZONES.CL,
    );
    expect(instant.toISOString()).toBe("2026-01-15T21:00:00.000Z");
  });

  it("convierte 18:00 de Santiago en INVIERNO austral (julio) a 22:00Z (UTC-4)", () => {
    const instant = wallTimeToUtc(
      { year: 2026, month: 7, day: 15, hour: 18 },
      OPERATIONAL_TIMEZONES.CL,
    );
    expect(instant.toISOString()).toBe("2026-07-15T22:00:00.000Z");
  });

  it("convierte 17:00 de Bogotá a 22:00Z todo el año (UTC-5, sin DST)", () => {
    const enero = wallTimeToUtc(
      { year: 2026, month: 1, day: 15, hour: 17 },
      OPERATIONAL_TIMEZONES.CO,
    );
    const julio = wallTimeToUtc(
      { year: 2026, month: 7, day: 15, hour: 17 },
      OPERATIONAL_TIMEZONES.CO,
    );
    expect(enero.toISOString()).toBe("2026-01-15T22:00:00.000Z");
    expect(julio.toISOString()).toBe("2026-07-15T22:00:00.000Z");
  });

  it("la MISMA sesión es un solo instante: 18:00 CL invierno = 17:00 CO", () => {
    const santiago = wallTimeToUtc(
      { year: 2026, month: 7, day: 22, hour: 18 },
      OPERATIONAL_TIMEZONES.CL,
    );
    const bogota = wallTimeToUtc(
      { year: 2026, month: 7, day: 22, hour: 17 },
      OPERATIONAL_TIMEZONES.CO,
    );
    expect(santiago.getTime()).toBe(bogota.getTime());
  });

  it("acepta minutos y segundos", () => {
    const instant = wallTimeToUtc(
      { year: 2026, month: 7, day: 15, hour: 9, minute: 30, second: 15 },
      OPERATIONAL_TIMEZONES.PE,
    );
    expect(instant.toISOString()).toBe("2026-07-15T14:30:15.000Z");
  });
});

describe("utcToZonedParts", () => {
  it("descompone medianoche sin producir hora 24", () => {
    // 03:00Z en enero = 00:00 en Santiago (UTC-3).
    const parts = utcToZonedParts(new Date("2026-01-15T03:00:00Z"), OPERATIONAL_TIMEZONES.CL);
    expect(parts.hour).toBe(0);
    expect(parts.day).toBe(15);
  });
});

describe("operationalDate", () => {
  it("una sesión de la tarde-noche NO se escapa al día siguiente (bug de reportes de LGS)", () => {
    // Sesión 20:00 Santiago invierno = 00:00Z del día siguiente en UTC.
    const instant = wallTimeToUtc(
      { year: 2026, month: 7, day: 15, hour: 20 },
      OPERATIONAL_TIMEZONES.CL,
    );
    expect(instant.toISOString()).toBe("2026-07-16T00:00:00.000Z");
    // En la zona operativa sigue siendo 15 de julio.
    expect(operationalDate(instant, OPERATIONAL_TIMEZONES.CL)).toBe("2026-07-15");
  });

  it("la fecha operativa depende de la zona del salón, no de UTC", () => {
    const instant = new Date("2026-01-15T02:00:00Z");
    // En Santiago (UTC-3) todavía es 14 de enero, 23:00.
    expect(operationalDate(instant, OPERATIONAL_TIMEZONES.CL)).toBe("2026-01-14");
  });
});

describe("operationalDayOfWeek", () => {
  it("respeta la frontera de día de la zona operativa", () => {
    // 2026-07-16T00:30Z = miércoles 15 de julio, 20:30 en Santiago.
    const instant = new Date("2026-07-16T00:30:00Z");
    expect(operationalDayOfWeek(instant, OPERATIONAL_TIMEZONES.CL)).toBe(3); // miércoles
  });
});

describe("isValidTimeZone", () => {
  it("acepta las cuatro zonas operativas", () => {
    for (const zone of Object.values(OPERATIONAL_TIMEZONES)) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });

  it("rechaza zonas inexistentes", () => {
    expect(isValidTimeZone("America/Ciudad_Inventada")).toBe(false);
  });
});
