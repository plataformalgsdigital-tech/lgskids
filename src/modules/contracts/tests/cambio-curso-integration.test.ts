import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { crearNino, obtenerDetalleNino } from "@/modules/people";
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
import { opcionesAcademicas } from "../application/academic-change";

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
  let campania2Id: string;
  let salonOtraCampania: string;
  let nivelOtraCampania: string;
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
    // Segunda campaña: el niño puede pasar a ella (anterior o posterior).
    const campania2 = await crearCampania({
      actorUserId: ACTOR,
      nombre: `IT Curso2 ${marca}`,
      inicio: hoy,
      cursoInicio: hoy,
    });
    campania2Id = campania2.id;
    const yg2 = await queryOne<{ course: string; nivel: string }>(
      `SELECT co.id::text AS course,
              (SELECT n.id::text FROM catalog_level n WHERE n.course_id = co.id ORDER BY n.orden LIMIT 1) AS nivel
         FROM catalog_course co WHERE co.campaign_id = $1 AND co.tipo = 'YOUNGSTER'`,
      [campania2Id],
    );
    nivelOtraCampania = yg2?.nivel ?? "";
    salonOtraCampania = await salon(yg2?.course ?? "", `IT Yg2 ${marca}`);
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
    for (const id of [salonJunior, salonYoungster, salonOtraCampania]) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM progression_ubicacion WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM catalog_campaign WHERE id = ANY($1)`, [[campaniaId, campania2Id]]);
    await closePool();
  });

  it("Academic Change ofrece cada salón con su horario y su país", async () => {
    const op = await opcionesAcademicas(contractId);
    const jr = op.salones.find((s) => s.id === salonJunior);
    expect(jr?.pais).toBe("CO");
    expect(jr?.horario).toEqual([
      { tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 },
    ]);
  });

  it("la ficha del niño trae su SIGUIENTE clase, con la zona del salón", async () => {
    const ficha = await obtenerDetalleNino(ninoId);
    const sig = ficha.siguienteClase;
    expect(sig).not.toBeNull();
    expect(sig?.timezone).toBe("America/Bogota");
    expect(sig?.tipo).toBe("SESION");
    // Termina por delante: la que ya terminó no es la "siguiente".
    const fin = new Date(sig?.startsAt ?? 0).getTime() + (sig?.duracionMin ?? 0) * 60_000;
    expect(fin).toBeGreaterThan(Date.now());
    // Salón sin guía ni enlace propio: no hay sala que copiar.
    expect(sig?.meetingUrl).toBeNull();
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

  it("no se cambia al curso que ya tiene (sin salón de otra campaña)", async () => {
    await expect(
      cambiarCursoContrato({
        actorUserId: ACTOR,
        contractId,
        tipoCurso: "YOUNGSTER",
        motivo: "otra vez lo mismo",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("pasa al MISMO curso de OTRA campaña con su ubicación, y el salón la trae identificada", async () => {
    const antes = await opcionesAcademicas(contractId);
    const destino = antes.salones.find((s) => s.id === salonOtraCampania);
    expect(destino?.campaignId).toBe(campania2Id);
    expect(antes.actual.campaignId).toBe(campaniaId);

    await cambiarCursoContrato({
      actorUserId: ACTOR,
      contractId,
      tipoCurso: "YOUNGSTER",
      classroomId: salonOtraCampania,
      ubicacion: { levelId: nivelOtraCampania, lecciones: 0 },
      motivo: "pasa a la campaña siguiente",
    });
    const ficha = await fichaContrato(contractId, null);
    expect(ficha.contrato.salon).toBe(`IT Yg2 ${marca}`);
    const despues = await opcionesAcademicas(contractId);
    expect(despues.actual.campaignId).toBe(campania2Id);
  });
});
