import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { newId } from "@/platform/ids";
import { ConflictError } from "@/platform/errors";
import { crearNino } from "@/modules/people";
import { aprobarContrato, crearContrato, inactivarContrato } from "@/modules/contracts";
import { cambioAcademico, matricular, obtenerRoster } from "../application/matricula";

/**
 * INTEGRACIÓN Fase 7: alta única CON matrícula, control de cupo, cambio
 * académico con historial, y cascada de inactivación que cancela la
 * matrícula. Requiere INTEGRATION_TESTS=1, migraciones y seed (roles).
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const sufijo = Math.random().toString(36).slice(2, 8);

async function crearNinoConContrato(n: number): Promise<{ ninoId: string; contractId: string }> {
  const { ninoId, apoderadoId } = await crearNino({
    actorUserId: ACTOR,
    nino: {
      nombres: `Niño${n}`,
      apellidos: `Matric${sufijo}`,
      fechaNacimiento: "2018-03-10",
      docTipo: "TI",
      docNumero: `EN-${sufijo}-${n}`,
      countryCode: "CO",
    },
    apoderadoNuevo: {
      nombres: `Apo${n}`,
      apellidos: `Matric${sufijo}`,
      docTipo: "CC",
      docNumero: `EN-${sufijo}-A${n}`,
      countryCode: "CO",
    },
  });
  const contractId = await crearContrato({
    actorUserId: ACTOR,
    titularId: apoderadoId,
    beneficiarioId: ninoId,
    countryCode: "CO",
    tipoCurso: "JUNIOR",
    inicio: "2026-08-03",
  });
  return { ninoId, contractId };
}

describe.runIf(RUN)("matrícula (integración)", () => {
  let campaignId: string;
  let courseId: string;
  let salonChicoId: string; // cupo 1
  let salonGrandeId: string; // cupo 10
  const limpiar: { tabla: string; id: string }[] = [];

  beforeAll(async () => {
    campaignId = newId();
    courseId = newId();
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2026-08-03', '2026-10-25',
               ('2026-08-03'::date + INTERVAL '21 days')::date, now())`,
      [campaignId, `IT Enroll ${sufijo}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-08-03', '2026-10-25', now())`,
      [courseId, campaignId],
    );
    salonChicoId = newId();
    salonGrandeId = newId();
    for (const [id, nombre, cupo] of [
      [salonChicoId, "Chico", 1],
      [salonGrandeId, "Grande", 10],
    ] as const) {
      await execute(
        `INSERT INTO scheduling_classroom
           (id, course_id, nombre, cupo, timezone, holiday_country, updated_at)
         VALUES ($1, $2, $3, $4, 'America/Bogota', 'CO', now())`,
        [id, courseId, nombre, cupo],
      );
    }
  });

  afterAll(async () => {
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = ANY($1)`, [
      [salonChicoId, salonGrandeId],
    ]);
    await execute(`DELETE FROM contracts_contract WHERE id = ANY($1)`, [
      limpiar.filter((l) => l.tabla === "contract").map((l) => l.id),
    ]);
    for (const userId of limpiar.filter((l) => l.tabla === "user").map((l) => l.id)) {
      await execute(`DELETE FROM identity_user WHERE id = $1`, [userId]);
    }
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Matric${sufijo}`]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await closePool();
  });

  async function registrarLimpieza(contractId: string, ninoId: string): Promise<void> {
    limpiar.push({ tabla: "contract", id: contractId });
    const persona = await queryOne<{ user_id: string | null }>(
      `SELECT user_id FROM people_person WHERE id = $1`,
      [ninoId],
    );
    if (persona?.user_id != null) limpiar.push({ tabla: "user", id: persona.user_id });
  }

  it("aprobar contrato CON salón = alta única completa (credenciales + matrícula)", async () => {
    const { ninoId, contractId } = await crearNinoConContrato(1);
    const resultado = await aprobarContrato({
      actorUserId: ACTOR,
      contractId,
      classroomId: salonChicoId,
    });
    await registrarLimpieza(contractId, ninoId);

    expect(resultado.credenciales).not.toBeNull();
    expect(resultado.enrollmentId).not.toBeNull();

    const roster = await obtenerRoster(salonChicoId);
    expect(roster).toHaveLength(1);
    expect(roster[0]?.nombres).toBe("Niño1");
  });

  it("CUPO LLENO: el segundo contrato no entra al salón de cupo 1", async () => {
    const { ninoId, contractId } = await crearNinoConContrato(2);
    const aprobado = await aprobarContrato({ actorUserId: ACTOR, contractId }); // sin salón
    await registrarLimpieza(contractId, ninoId);
    expect(aprobado.enrollmentId).toBeNull();

    await expect(
      matricular({ actorUserId: ACTOR, contractId, classroomId: salonChicoId }),
    ).rejects.toBeInstanceOf(ConflictError);

    // En el salón grande sí entra.
    const ok = await matricular({ actorUserId: ACTOR, contractId, classroomId: salonGrandeId });
    expect(ok.enrollmentId).toBeTruthy();
  });

  it("no se puede matricular dos veces el mismo contrato", async () => {
    const roster = await obtenerRoster(salonGrandeId);
    const contrato = await queryOne<{ contract_id: string }>(
      `SELECT contract_id FROM enrollment_enrollment WHERE id = $1`,
      [roster[0]?.enrollmentId],
    );
    await expect(
      matricular({
        actorUserId: ACTOR,
        contractId: contrato?.contract_id as string,
        classroomId: salonGrandeId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("CAMBIO ACADÉMICO: mueve al niño conservando historial y libera el cupo", async () => {
    // El niño 1 (salón chico, cupo 1) se muda al grande.
    const rosterChico = await obtenerRoster(salonChicoId);
    const enrollmentId = rosterChico[0]?.enrollmentId as string;

    const movido = await cambioAcademico({
      actorUserId: ACTOR,
      enrollmentId,
      nuevoClassroomId: salonGrandeId,
      motivo: "cambio de horario solicitado por el apoderado",
    });
    expect(movido.enrollmentId).not.toBe(enrollmentId);

    // El chico quedó vacío (cupo liberado) y el historial conserva la fila FINALIZADA.
    expect(await obtenerRoster(salonChicoId)).toHaveLength(0);
    const anterior = await queryOne<{ estado: string; motivo_cierre: string }>(
      `SELECT estado, motivo_cierre FROM enrollment_enrollment WHERE id = $1`,
      [enrollmentId],
    );
    expect(anterior?.estado).toBe("FINALIZADA");
    expect(anterior?.motivo_cierre).toContain("cambio académico");

    // Ahora el grande tiene 2 niños.
    expect(await obtenerRoster(salonGrandeId)).toHaveLength(2);
  });

  it("inactivar contrato CANCELA la matrícula (cascada) y sale del roster", async () => {
    const roster = await obtenerRoster(salonGrandeId);
    const victima = roster.find((r) => r.nombres === "Niño2");
    const contrato = await queryOne<{ contract_id: string }>(
      `SELECT contract_id FROM enrollment_enrollment WHERE id = $1`,
      [victima?.enrollmentId],
    );
    await inactivarContrato({
      actorUserId: ACTOR,
      contractId: contrato?.contract_id as string,
      motivo: "retiro para prueba de cascada",
    });

    expect(await obtenerRoster(salonGrandeId)).toHaveLength(1);
    const cancelada = await queryOne<{ estado: string }>(
      `SELECT estado FROM enrollment_enrollment WHERE id = $1`,
      [victima?.enrollmentId],
    );
    expect(cancelada?.estado).toBe("CANCELADA");
  });
});
