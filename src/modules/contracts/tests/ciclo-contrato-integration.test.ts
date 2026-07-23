import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError } from "@/platform/errors";
import { crearNino } from "@/modules/people";
import {
  aprobarContrato,
  crearContrato,
  inactivarContrato,
  ponerEnPausa,
  reactivar,
} from "../application/gestion-contratos";
import { findContractById } from "../infrastructure/contract-repository";

/**
 * INTEGRACIÓN del ciclo de vida completo del contrato (secciones 2.4/2.5):
 * alta única con credenciales, OnHold con extensión, cascada de inactivación.
 * Requiere INTEGRATION_TESTS=1 + Postgres migrado + seed (roles).
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;

const ACTOR = "00000000-0000-0000-0000-000000000000";
const sufijo = Math.random().toString(36).slice(2, 8);

describe.runIf(RUN)("ciclo de vida del contrato (integración)", () => {
  let ninoId: string;
  let apoderadoId: string;
  let contractId: string;
  let username: string | undefined;

  beforeAll(async () => {
    const resultado = await crearNino({
      actorUserId: ACTOR,
      nino: {
        nombres: "Valentina",
        apellidos: `Prueba${sufijo}`,
        fechaNacimiento: "2018-03-10", // 8 años al 2026-08-03 → JUNIOR
        docTipo: "TI",
        docNumero: `IT-${sufijo}-N`,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: "Carlos",
        apellidos: `Prueba${sufijo}`,
        docTipo: "CC",
        docNumero: `IT-${sufijo}-A`,
        countryCode: "CO",
        email: "papa@example.com",
      },
      parentesco: "padre",
    });
    ninoId = resultado.ninoId;
    apoderadoId = resultado.apoderadoId;
  });

  afterAll(async () => {
    // Limpieza en orden inverso de dependencias.
    if (contractId !== undefined) {
      await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    }
    if (username !== undefined) {
      await execute(`DELETE FROM identity_user WHERE username = $1`, [username]);
    }
    await execute(`DELETE FROM people_person WHERE id = ANY($1)`, [[ninoId, apoderadoId]]);
    await closePool();
  });

  it("crea el contrato validando la edad contra la fecha de nacimiento", async () => {
    // 8 años → YOUNGSTER debe fallar
    await expect(
      crearContrato({
        actorUserId: ACTOR,
        titularId: apoderadoId,
        beneficiarioId: ninoId,
        countryCode: "CO",
        tipoCurso: "YOUNGSTER",
        inicio: "2026-08-03",
        finalContrato: "2026-12-20",
      }),
    ).rejects.toThrow();

    contractId = await crearContrato({
      actorUserId: ACTOR,
      titularId: apoderadoId,
      beneficiarioId: ninoId,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: "2026-08-03",
      finalContrato: "2026-12-20",
    });
    expect(contractId).toBeTruthy();
  });

  it("APROBAR = alta única: credenciales con username autogenerado, correo sintético y rol alumno CO", async () => {
    const { credenciales } = await aprobarContrato({ actorUserId: ACTOR, contractId });
    expect(credenciales).not.toBeNull();
    username = credenciales?.username;
    expect(credenciales?.username).toMatch(/^vprueba/);
    expect(credenciales?.correo).toContain("@alumnos.lgskidsplataforma.com");
    expect(credenciales?.passwordInicial.length).toBeGreaterThanOrEqual(10);

    // La persona quedó vinculada y con rol alumno de alcance CO.
    const vinculo = await queryOne<{ user_id: string | null }>(
      `SELECT user_id FROM people_person WHERE id = $1`,
      [ninoId],
    );
    expect(vinculo?.user_id).not.toBeNull();
    const rol = await queryOne<{ country_code: string | null }>(
      `SELECT ur.country_code
         FROM access_user_role ur JOIN access_role r ON r.id = ur.role_id
        WHERE ur.user_id = $1 AND r.code = 'alumno'`,
      [vinculo?.user_id],
    );
    expect(rol?.country_code).toBe("CO");
  });

  it("re-aprobar falla (solo PENDIENTE se aprueba)", async () => {
    await expect(aprobarContrato({ actorUserId: ACTOR, contractId })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("OnHold y reactivar: los días pausados EXTIENDEN final_contrato", async () => {
    await ponerEnPausa({ actorUserId: ACTOR, contractId, motivo: "viaje familiar" });
    // Simular que la pausa empezó hace 10 días.
    await execute(
      `UPDATE contracts_onhold SET desde = desde - 10 WHERE contract_id = $1 AND hasta IS NULL`,
      [contractId],
    );
    const resultado = await reactivar({ actorUserId: ACTOR, contractId });
    expect(resultado.diasExtendidos).toBe(10);
    expect(resultado.nuevoFinal).toBe("2026-12-30"); // 2026-12-20 + 10

    const contrato = await findContractById(contractId);
    expect(contrato?.estado).toBe("APROBADO");
    expect(contrato?.finalContrato).toBe("2026-12-30");
  });

  it("INACTIVAR dispara la cascada sincronizada: contrato + persona + credenciales + sesiones", async () => {
    await inactivarContrato({
      actorUserId: ACTOR,
      contractId,
      motivo: "retiro voluntario",
    });

    const contrato = await findContractById(contractId);
    expect(contrato?.estado).toBe("INACTIVO");

    const persona = await queryOne<{ estado: string; user_id: string }>(
      `SELECT estado, user_id FROM people_person WHERE id = $1`,
      [ninoId],
    );
    expect(persona?.estado).toBe("INACTIVA");

    const usuario = await queryOne<{ estado: string }>(
      `SELECT estado FROM identity_user WHERE id = $1`,
      [persona?.user_id],
    );
    expect(usuario?.estado).toBe("INACTIVO");
  });

  it("inactivar es idempotente", async () => {
    await expect(
      inactivarContrato({ actorUserId: ACTOR, contractId, motivo: "repetido a propósito" }),
    ).resolves.toBeUndefined();
  });
});
