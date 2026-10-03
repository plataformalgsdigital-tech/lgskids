import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import {
  aprobarContrato,
  cambiarCursoContrato,
  crearReservaBeneficiario,
} from "@/modules/contracts";
import { crearSalon } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ValidationError } from "@/platform/errors";
import { progresoDeNino } from "../application/recalcular";
import { ubicarNino } from "../application/ubicacion";

/**
 * UBICACIÓN ACADÉMICA (Academic Change): el punto de partida que fija
 * coordinación es una ENTRADA de la función central, no una edición del
 * avance. Lo que se fija aquí:
 *  - los niveles anteriores quedan completados por convalidación, SIN medalla;
 *  - volver al Welcome borra la ubicación y el avance vuelve a lo ganado;
 *  - el nivel tiene que ser del curso del niño;
 *  - promover a Youngster mueve la matrícula y ubica en el curso nuevo en UNA
 *    transacción: si la ubicación es inválida, no se mueve nada.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
// `ubicado_por` es clave foránea: hace falta un usuario REAL. El de sistema lo
// crea una migración, así que existe también en la base vacía de CI.
const ACTOR = "11111111-1111-4111-8111-111111111111";
const marca = randomUUID().slice(0, 6);
const hoy = new Date().toISOString().slice(0, 10);

describe.runIf(RUN)("ubicación académica (integración)", () => {
  let campaniaId: string;
  const salones: Record<"JUNIOR" | "YOUNGSTER", string> = { JUNIOR: "", YOUNGSTER: "" };
  const niveles: Record<string, Record<string, string>> = {};
  let contractId: string;
  let ninoId: string;

  beforeAll(async () => {
    const campania = await crearCampania({
      actorUserId: ACTOR,
      nombre: `Ubicacion ${marca}`,
      inicio: hoy,
      cursoInicio: hoy,
    });
    campaniaId = campania.id;
    for (const tipo of ["JUNIOR", "YOUNGSTER"] as const) {
      const curso = await queryOne<{ id: string }>(
        `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = $2::catalog_course_tipo`,
        [campaniaId, tipo],
      );
      const salon = await crearSalon({
        actorUserId: ACTOR,
        courseId: curso?.id ?? "",
        nombre: `${tipo} Ubicacion ${marca}`,
        cupo: 5,
        timezone: "America/Bogota",
        holidayCountry: "CO",
        slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 }],
      });
      salones[tipo] = salon.id;
      const filas = await queryRows<{ id: string; codigo: string }>(
        `SELECT id, codigo FROM catalog_level WHERE course_id = $1`,
        [curso?.id ?? ""],
      );
      niveles[tipo] = Object.fromEntries(filas.map((f) => [f.codigo, f.id]));
    }
    const r = await crearReservaBeneficiario({
      actorUserId: ACTOR,
      externalRef: `02-8${marca.replace(/\D/g, "2")}2-26#U${marca}`,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: hoy,
      classroomId: salones.JUNIOR,
      titular: {
        nombres: "Titular",
        apellidos: `Ubic${marca}`,
        docTipo: "CC",
        docNumero: `TU-${marca}`,
        countryCode: "CO",
        email: `ubic-${marca}@prueba.lgs`,
      },
      titularEsApoderado: true,
      nino: {
        nombres: "Nino",
        apellidos: `Ubic${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
        docTipo: "TI",
        docNumero: `NU-${marca}`,
        countryCode: "CO",
      },
      parentesco: "MADRE",
    });
    contractId = r.contractId;
    await aprobarContrato({ actorUserId: ACTOR, contractId });
    const c = await queryOne<{ beneficiario_id: string }>(
      `SELECT beneficiario_id FROM contracts_contract WHERE id = $1`,
      [contractId],
    );
    ninoId = c?.beneficiario_id ?? "";
  });

  afterAll(async () => {
    const usuario = await queryOne<{ user_id: string | null }>(
      `SELECT user_id FROM people_person WHERE id = $1`,
      [ninoId],
    );
    await execute(`DELETE FROM progression_award WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM progression_level_progress WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM progression_ubicacion WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM enrollment_enrollment WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    await execute(`DELETE FROM people_guardianship WHERE nino_id = $1`, [ninoId]);
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Ubic${marca}`]);
    if (usuario?.user_id) {
      await execute(`DELETE FROM access_user_role WHERE user_id = $1`, [usuario.user_id]);
      await execute(`DELETE FROM identity_user WHERE id = $1`, [usuario.user_id]);
    }
    for (const id of Object.values(salones)) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("ubicar en Champion convalida Rookie SIN medalla y arranca con las lecciones dadas", async () => {
    await ubicarNino({
      childPersonId: ninoId,
      levelId: niveles.JUNIOR?.CHAMPION ?? "",
      lecciones: 2,
      motivo: "Entró tarde, el salón va en Champion",
      actorUserId: ACTOR,
    });
    const p = await progresoDeNino(ninoId);
    const rookie = p.niveles.find((n) => n.codigo === "ROOKIE");
    const champion = p.niveles.find((n) => n.codigo === "CHAMPION");
    expect(rookie).toMatchObject({ estado: "COMPLETADO", convalidado: true, medalla: false });
    expect(champion).toMatchObject({ estado: "EN_CURSO", leccionesCompletadas: 2 });
    expect(p.ubicacion).toMatchObject({ levelId: niveles.JUNIOR?.CHAMPION, lecciones: 2 });
  });

  it("volver al Welcome borra la ubicación y el avance vuelve a lo ganado", async () => {
    await ubicarNino({
      childPersonId: ninoId,
      levelId: niveles.JUNIOR?.ROOKIE ?? "",
      lecciones: 0,
      motivo: "Corrección: empieza desde el Welcome",
      actorUserId: ACTOR,
    });
    const p = await progresoDeNino(ninoId);
    expect(p.ubicacion).toBeNull();
    expect(p.niveles.find((n) => n.codigo === "ROOKIE")).toMatchObject({
      estado: "EN_CURSO",
      convalidado: false,
    });
  });

  it("el nivel tiene que ser del curso del niño", async () => {
    await expect(
      ubicarNino({
        childPersonId: ninoId,
        levelId: niveles.YOUNGSTER?.ELITE ?? "",
        lecciones: 0,
        motivo: "Nivel de otro curso",
        actorUserId: ACTOR,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("promover con un nivel que no es del curso nuevo no mueve NADA", async () => {
    await expect(
      cambiarCursoContrato({
        actorUserId: ACTOR,
        contractId,
        tipoCurso: "YOUNGSTER",
        classroomId: salones.YOUNGSTER,
        ubicacion: { levelId: niveles.JUNIOR?.ELITE ?? "", lecciones: 1 },
        motivo: "Promoción de prueba",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const c = await queryOne<{ tipo: string }>(
      `SELECT tipo_curso::text AS tipo FROM contracts_contract WHERE id = $1`,
      [contractId],
    );
    expect(c?.tipo).toBe("JUNIOR");
  });

  it("promover a Youngster lo matricula y lo ubica en el curso nuevo", async () => {
    await cambiarCursoContrato({
      actorUserId: ACTOR,
      contractId,
      tipoCurso: "YOUNGSTER",
      classroomId: salones.YOUNGSTER,
      ubicacion: { levelId: niveles.YOUNGSTER?.ELITE ?? "", lecciones: 1 },
      motivo: "Promoción de prueba",
    });
    const p = await progresoDeNino(ninoId);
    expect(p.curso?.tipo).toBe("YOUNGSTER");
    expect(p.niveles.find((n) => n.codigo === "CHAMPION")).toMatchObject({
      estado: "COMPLETADO",
      convalidado: true,
    });
    expect(p.niveles.find((n) => n.codigo === "ELITE")).toMatchObject({
      estado: "EN_CURSO",
      leccionesCompletadas: 1,
    });
  });
});
