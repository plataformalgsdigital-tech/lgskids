import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { crearNino } from "@/modules/people";
import { crearSalon } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import {
  aprobarContrato,
  cambiarCursoContrato,
  crearContrato,
  fichaContrato,
} from "../application/gestion-contratos";

/**
 * CAMBIO DE CURSO desde la ficha del contrato.
 *
 * Lo que se fija aquí:
 *  - contrato y matrícula quedan SIEMPRE del mismo curso. Si el contrato dijera
 *    YOUNGSTER y la matrícula siguiera en un salón JUNIOR, el siguiente cambio
 *    de salón lo rechazaría `matricularTx` y nadie sabría por qué;
 *  - la matrícula anterior se CIERRA (no se duplica el niño en dos salones);
 *  - la edad ADVIERTE pero no bloquea: los rangos de los dos cursos son
 *    disjuntos, así que exigirla haría imposible todo cambio de curso.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 6);

describe.runIf(RUN)("cambio de curso (integración)", () => {
  let campaniaId: string;
  let salonJunior: string;
  let salonYoungster: string;
  let ninoId: string;
  let apoderadoId: string;
  let contractId: string;
  let username: string | undefined;

  const hoy = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const campania = await crearCampania({
      actorUserId: ACTOR,
      nombre: `IT Curso ${marca}`,
      inicio: hoy,
      cursoInicio: hoy,
    });
    campaniaId = campania.id;
    const cursos = await queryOne<{ junior: string; youngster: string }>(
      `SELECT max(id::text) FILTER (WHERE tipo = 'JUNIOR') AS junior,
              max(id::text) FILTER (WHERE tipo = 'YOUNGSTER') AS youngster
         FROM catalog_course WHERE campaign_id = $1`,
      [campaniaId],
    );
    const salon = async (courseId: string, nombre: string) =>
      (
        await crearSalon({
          actorUserId: ACTOR,
          courseId,
          nombre,
          cupo: 5,
          timezone: "America/Bogota",
          holidayCountry: "CO",
          slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 }],
        })
      ).id;
    salonJunior = await salon(cursos?.junior ?? "", `IT Jr ${marca}`);
    salonYoungster = await salon(cursos?.youngster ?? "", `IT Yg ${marca}`);

    const personas = await crearNino({
      actorUserId: ACTOR,
      nino: {
        nombres: "Curso",
        apellidos: `Prueba${marca}`,
        // 8 años hoy: entra en JUNIOR y NO en YOUNGSTER.
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-01-10`,
        docTipo: "TI",
        docNumero: `C-${marca}-N`,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: "Madre",
        apellidos: `Prueba${marca}`,
        docTipo: "CC",
        docNumero: `C-${marca}-A`,
        countryCode: "CO",
        email: `madre-${marca}@prueba.lgs`,
      },
      parentesco: "MADRE",
    });
    ninoId = personas.ninoId;
    apoderadoId = personas.apoderadoId;

    contractId = await crearContrato({
      actorUserId: ACTOR,
      titularId: apoderadoId,
      beneficiarioId: ninoId,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: hoy,
    });
    const alta = await aprobarContrato({
      actorUserId: ACTOR,
      contractId,
      classroomId: salonJunior,
    });
    username = alta.credenciales?.username;
  });

  afterAll(async () => {
    await execute(`DELETE FROM enrollment_enrollment WHERE contract_id = $1`, [contractId]);
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    if (username !== undefined) {
      await execute(`DELETE FROM identity_user WHERE username = $1`, [username]);
    }
    await execute(`DELETE FROM people_person WHERE id = ANY($1)`, [[ninoId, apoderadoId]]);
    for (const id of [salonJunior, salonYoungster]) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("exige el salón del curso nuevo cuando el niño está matriculado", async () => {
    await expect(
      cambiarCursoContrato({
        actorUserId: ACTOR,
        contractId,
        tipoCurso: "YOUNGSTER",
        motivo: "cumplió años y sube de curso",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("mueve contrato Y matrícula juntos, y avisa de la edad sin bloquear", async () => {
    const r = await cambiarCursoContrato({
      actorUserId: ACTOR,
      contractId,
      tipoCurso: "YOUNGSTER",
      classroomId: salonYoungster,
      motivo: "cumplió años y sube de curso",
    });
    expect(r.enrollmentId).toBeTruthy();
    // 8 años: la regla del alta lo rechazaría. Aquí solo advierte.
    expect(r.advertencia).toBeTruthy();

    const ficha = await fichaContrato(contractId, null);
    expect(ficha.contrato.tipoCurso).toBe("YOUNGSTER");
    expect(ficha.contrato.salon).toBe(`IT Yg ${marca}`);

    // La anterior quedó CERRADA: el niño no puede estar en dos salones.
    const vivas = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM enrollment_enrollment
        WHERE contract_id = $1 AND estado IN ('ACTIVA', 'RESERVADA')`,
      [contractId],
    );
    expect(vivas?.n).toBe(1);
  });

  it("no se cambia al curso que ya tiene", async () => {
    await expect(
      cambiarCursoContrato({
        actorUserId: ACTOR,
        contractId,
        tipoCurso: "YOUNGSTER",
        classroomId: salonYoungster,
        motivo: "otra vez lo mismo",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
