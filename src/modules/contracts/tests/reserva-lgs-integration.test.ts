import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { crearSalon } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError } from "@/platform/errors";
import { crearReservaBeneficiario } from "../application/gestion-contratos";

/**
 * La puerta de LGS (ADR-0010). Lo que se fija aquí es lo que se descubrió al
 * probar la integración contra producción (2026-09-26):
 *
 *  - el N° de contrato LGS llega con el DOCUMENTO del niño al final, porque un
 *    contrato de LGS puede traer varios hermanos y en KIDS cada niño es su
 *    propio contrato;
 *  - reenviar la MISMA reserva devuelve la que ya existe en vez de fallar. LGS
 *    reintenta cuando su respuesta se pierde, y con un 409 se quedaba sin los
 *    ids: no marcaba "enviado", no llegaba a aprobar, y el niño quedaba con el
 *    cupo tomado y sin cuenta.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 6);

/** Hoy en UTC, y un año de contrato lo pone la propia aplicación. */
const hoy = new Date().toISOString().slice(0, 10);

const nino = (doc: string) => ({
  nombres: "Reserva",
  apellidos: `Prueba${marca}`,
  fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
  docTipo: "TI",
  docNumero: doc,
  countryCode: "CO",
});
const titular = {
  nombres: "Titular",
  apellidos: `Prueba${marca}`,
  docTipo: "CC",
  docNumero: `T-${marca}`,
  countryCode: "CO",
  email: `titular-${marca}@prueba.lgs`,
};

describe.runIf(RUN)("reserva desde LGS (integración)", () => {
  let classroomId: string;
  let campaniaId: string;
  const externalRef = `02-9${marca.replace(/\D/g, "1")}1-26#N${marca}`;

  beforeAll(async () => {
    const campania = await crearCampania({
      actorUserId: ACTOR,
      nombre: `Reserva LGS ${marca}`,
      inicio: hoy,
      cursoInicio: hoy,
    });
    campaniaId = campania.id;
    const curso = await queryOne<{ id: string }>(
      `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
      [campaniaId],
    );
    const salon = await crearSalon({
      actorUserId: ACTOR,
      courseId: curso?.id ?? "",
      nombre: `Salón prueba ${marca}`,
      cupo: 5,
      timezone: "America/Bogota",
      holidayCountry: "CO",
      slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 }],
    });
    classroomId = salon.id;
  });

  afterAll(async () => {
    // En orden: matrículas → contratos → personas → salón → campaña.
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM contracts_contract WHERE external_ref LIKE $1`, [`%#N${marca}%`]);
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Prueba${marca}`]);
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [classroomId]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [classroomId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("acepta el N° de LGS con el documento del niño al final", async () => {
    const r = await crearReservaBeneficiario({
      actorUserId: ACTOR,
      externalRef,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: hoy,
      classroomId,
      titular,
      titularEsApoderado: true,
      nino: nino(`N-${marca}`),
      parentesco: "MADRE",
    });
    expect(r.contractId).toBeTruthy();
    expect(r.enrollmentId).toBeTruthy();
  });

  it("reenviar la MISMA reserva devuelve la que ya existe, no un conflicto", async () => {
    const primera = await queryOne<{ id: string }>(
      `SELECT id FROM contracts_contract WHERE external_ref = $1`,
      [externalRef],
    );
    const otraVez = await crearReservaBeneficiario({
      actorUserId: ACTOR,
      externalRef,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: hoy,
      classroomId,
      titular,
      titularEsApoderado: true,
      nino: nino(`N-${marca}`),
      parentesco: "MADRE",
    });
    expect(otraVez.contractId).toBe(primera?.id);
    // Y no se duplicó nada.
    const cuantos = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM contracts_contract WHERE external_ref = $1`,
      [externalRef],
    );
    expect(cuantos?.n).toBe(1);
  });

  it("la misma referencia con OTRO niño sí es conflicto", async () => {
    await expect(
      crearReservaBeneficiario({
        actorUserId: ACTOR,
        externalRef,
        countryCode: "CO",
        tipoCurso: "JUNIOR",
        inicio: hoy,
        classroomId,
        titular,
        titularEsApoderado: true,
        nino: nino(`OTRO-${marca}`),
        parentesco: "MADRE",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
