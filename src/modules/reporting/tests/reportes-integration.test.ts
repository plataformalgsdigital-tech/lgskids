import { afterAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { ValidationError } from "@/platform/errors";
import { asistenciaPorSalonMes, contratosPorPais, ocupacionSalones } from "../index";

const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

describe.runIf(RUN)("reportes (integración: las consultas AT TIME ZONE corren)", () => {
  afterAll(async () => {
    await closePool();
  });

  it("asistencia por salón/mes ejecuta y devuelve la forma esperada", async () => {
    const filas = await asistenciaPorSalonMes("2026-08");
    expect(Array.isArray(filas)).toBe(true);
    for (const fila of filas) {
      expect(typeof fila.salon).toBe("string");
      expect(typeof fila.sesionesDelMes).toBe("number");
    }
  });

  it("rechaza un mes malformado", async () => {
    await expect(asistenciaPorSalonMes("agosto")).rejects.toBeInstanceOf(ValidationError);
  });

  it("ocupación y contratos por país ejecutan (con y sin alcance)", async () => {
    expect(Array.isArray(await ocupacionSalones())).toBe(true);
    expect(Array.isArray(await contratosPorPais(null))).toBe(true);
    expect(Array.isArray(await contratosPorPais(["CO", "CL"]))).toBe(true);
  });
});
