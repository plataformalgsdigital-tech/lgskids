import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { crearNino } from "@/modules/people";
import { crearSalon, festivosProximos } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError } from "@/platform/errors";
import { aprobarContrato, crearContrato } from "../application/gestion-contratos";
import { aprobarCambioFestivo, sugerenciasFestivo } from "../application/gestion-festivos";

/**
 * GESTIÓN FESTIVOS — a QUIÉN toca y qué NO cambia. Feriado de COLOMBIA, salón con
 * calendario de Colombia, con niños de Colombia y de Ecuador:
 *  - el niño de ECUADOR (ese día no es feriado para él) es el único que sale como
 *    afectado y con sugerencias;
 *  - el niño de COLOMBIA está de feriado: no aparece, y aprobarle algo se rechaza;
 *  - si Ecuador TAMBIÉN tiene feriado ese día, el de Ecuador tampoco se toca;
 *  - aprobar crea UN agendado de UNA clase y nada más: la matrícula, el salón, las
 *    demás clases y la lista de los compañeros quedan igual.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const SISTEMA = "00000000-0000-0000-0000-000000000000";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumar = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

interface Chico {
  ninoId: string;
  apoderadoId: string;
  contractId: string;
  userId: string;
}

describe.runIf(RUN)("gestión de festivos: a quién toca (integración)", () => {
  let campaniaId: string;
  let salonCo = ""; // calendario CO: Colombia + Ecuador
  let salonDestino = ""; // calendario EC: sí dicta el día del feriado colombiano
  let salonCompartido = ""; // calendario CO, el feriado también es de Ecuador
  let co1: Chico;
  let ec1: Chico;
  let ec2: Chico;
  let fechaCo = "";
  let fechaCompartida = "";
  let sesionDestino = "";
  let perdida = "";
  const chicos: Chico[] = [];

  async function diaLibre(desde: number): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const d = iso(sumar(new Date(), desde + i));
      const hay = await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM scheduling_holiday WHERE fecha = $1::date`,
        [d],
      );
      if (hay?.n === 0) return d;
    }
    throw new Error("sin día libre");
  }

  async function chico(pais: string, tag: string, classroomId: string): Promise<Chico> {
    const hoy = iso(new Date());
    const p = await crearNino({
      actorUserId: SISTEMA,
      nino: {
        nombres: `Chico${tag}`,
        apellidos: `Alcance${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-01-10`,
        docTipo: "TI",
        docNumero: `A-${marca}-${tag}`,
        countryCode: pais,
      },
      apoderadoNuevo: {
        nombres: "Madre",
        apellidos: `Alcance${marca}${tag}`,
        docTipo: "CC",
        docNumero: `A-${marca}-${tag}-A`,
        countryCode: pais,
        email: `madre-a-${tag}-${marca}@prueba.lgs`,
      },
      parentesco: "MADRE",
    });
    const contractId = await crearContrato({
      actorUserId: SISTEMA,
      titularId: p.apoderadoId,
      beneficiarioId: p.ninoId,
      countryCode: pais,
      tipoCurso: "JUNIOR",
      inicio: hoy,
    });
    await aprobarContrato({ actorUserId: SISTEMA, contractId, classroomId, enviarPerfil: false });
    const userId =
      (
        await queryOne<{ userId: string }>(
          `SELECT user_id AS "userId" FROM people_person WHERE id = $1`,
          [p.ninoId],
        )
      )?.userId ?? "";
    const c = { ninoId: p.ninoId, apoderadoId: p.apoderadoId, contractId, userId };
    chicos.push(c);
    return c;
  }

  beforeAll(async () => {
    fechaCo = await diaLibre(50);
    fechaCompartida = await diaLibre(
      Math.round((new Date(fechaCo).getTime() - Date.now()) / 86_400_000) + 2,
    );
    const diaCo = new Date(`${fechaCo}T12:00:00Z`).getUTCDay();
    const diaComp = new Date(`${fechaCompartida}T12:00:00Z`).getUTCDay();
    // Los feriados se insertan ANTES de crear los salones: la generación los respeta.
    await execute(
      `INSERT INTO scheduling_holiday (country_code, fecha, nombre, fuente) VALUES
         ('CO', $1::date, $3, 'prueba'),
         ('CO', $2::date, $3, 'prueba'),
         ('EC', $2::date, $3, 'prueba')`,
      [fechaCo, fechaCompartida, `Festivo alcance ${marca}`],
    );

    const hoy = iso(new Date());
    const c = await crearCampania({
      actorUserId: SISTEMA,
      nombre: `IT Alcance ${marca}`,
      inicio: hoy,
      cursoInicio: hoy,
    });
    campaniaId = c.id;
    const curso =
      (
        await queryOne<{ id: string }>(
          `SELECT id::text AS id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
          [campaniaId],
        )
      )?.id ?? "";
    const salon = async (nombre: string, pais: string, tz: string, dia: number) =>
      (
        await crearSalon({
          actorUserId: SISTEMA,
          courseId: curso,
          nombre,
          cupo: 6,
          timezone: tz,
          holidayCountry: pais,
          slots: [{ tipo: "SESION", diaSemana: dia, horaLocal: "15:00", duracionMin: 60 }],
        })
      ).id;
    salonCo = await salon(`IT CO ${marca}`, "CO", "America/Bogota", diaCo);
    salonDestino = await salon(`IT EC ${marca}`, "EC", "America/Guayaquil", diaCo);
    salonCompartido = await salon(`IT CO2 ${marca}`, "CO", "America/Bogota", diaComp);

    co1 = await chico("CO", "C1", salonCo);
    ec1 = await chico("EC", "E1", salonCo);
    ec2 = await chico("EC", "E2", salonCompartido);

    sesionDestino =
      (
        await queryOne<{ id: string }>(
          `SELECT s.id::text AS id FROM scheduling_session s
             JOIN scheduling_classroom cl ON cl.id = s.classroom_id
            WHERE s.classroom_id = $1 AND (s.starts_at AT TIME ZONE cl.timezone)::date = $2::date`,
          [salonDestino, fechaCo],
        )
      )?.id ?? "";
    perdida =
      (
        await queryOne<{ t: string }>(
          `SELECT (($1::date + time '15:00') AT TIME ZONE 'America/Bogota')::text AS t`,
          [fechaCo],
        )
      )?.t ?? "";
  });

  afterAll(async () => {
    const ninos = chicos.flatMap((x) => [x.ninoId, x.apoderadoId]);
    await execute(`DELETE FROM scheduling_agendado WHERE child_person_id = ANY($1)`, [ninos]);
    await execute(`DELETE FROM enrollment_enrollment WHERE contract_id = ANY($1)`, [
      chicos.map((x) => x.contractId),
    ]);
    await execute(`DELETE FROM contracts_contract WHERE id = ANY($1)`, [
      chicos.map((x) => x.contractId),
    ]);
    for (const id of [salonCo, salonDestino, salonCompartido]) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM people_person WHERE id = ANY($1)`, [ninos]);
    await execute(`DELETE FROM identity_user WHERE id = ANY($1)`, [
      chicos.map((x) => x.userId).filter((u) => u !== ""),
    ]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await execute(`DELETE FROM scheduling_holiday WHERE fuente = 'prueba' AND nombre LIKE $1`, [
      `%${marca}`,
    ]);
    await closePool();
  });

  it("solo el niño de Ecuador sale como afectado; el de Colombia está de feriado", async () => {
    const f = (await festivosProximos({ dias: 120, countryScope: null })).find(
      (x) => x.pais === "CO" && x.fecha === fechaCo,
    );
    const salon = f?.salones.find((s) => s.id === salonCo);
    expect(salon?.ninosOtroPais).toBe(1);
    expect(salon?.ninosMismoPais).toBe(1);
    expect(f?.alumnos.map((a) => a.childPersonId)).toContain(ec1.ninoId);
    expect(f?.alumnos.map((a) => a.childPersonId)).not.toContain(co1.ninoId);
  });

  it("si Ecuador TAMBIÉN tiene feriado ese día, el niño de Ecuador no se toca", async () => {
    const f = (await festivosProximos({ dias: 120, countryScope: null })).find(
      (x) => x.pais === "CO" && x.fecha === fechaCompartida,
    );
    const salon = f?.salones.find((s) => s.id === salonCompartido);
    expect(salon?.ninosOtroPais).toBe(0);
    expect(salon?.ninosMismoPais).toBe(1); // el de Ecuador cuenta como "de feriado"
    expect(f?.alumnos.map((a) => a.childPersonId)).not.toContain(ec2.ninoId);
  });

  it("no se puede aprobar a quien está de feriado (Colombia, ni Ecuador con feriado propio)", async () => {
    const intento = (c: Chico, fecha: string, sessionId: string) =>
      aprobarCambioFestivo({
        actorUserId: ec1.userId,
        childPersonId: c.ninoId,
        countryScope: null,
        pais: "CO",
        fecha,
        sessionId,
        amplio: true,
        autorizarSobrecupo: false,
        puedeSobrecupo: false,
      });
    await expect(intento(co1, fechaCo, sesionDestino)).rejects.toBeInstanceOf(ConflictError);
    await expect(intento(ec2, fechaCompartida, sesionDestino)).rejects.toBeInstanceOf(
      ConflictError,
    );
    const n = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling_agendado WHERE child_person_id = ANY($1)`,
      [[co1.ninoId, ec2.ninoId]],
    );
    expect(n?.n).toBe(0);
  });

  it("aprobar al niño de Ecuador agenda UNA clase y no cambia nada más", async () => {
    expect(sesionDestino).not.toBe("");
    const sug = await sugerenciasFestivo({
      childPersonId: ec1.ninoId,
      countryScope: null,
      fecha: fechaCo,
      perdidaStartsAt: perdida,
      classroomId: salonCo,
    });
    expect(sug.opciones.map((o) => o.id)).toContain(sesionDestino);

    const antes = await queryOne<{ sesiones: number; matriculas: number }>(
      `SELECT (SELECT count(*)::int FROM scheduling_session WHERE classroom_id = $1) AS sesiones,
              (SELECT count(*)::int FROM enrollment_enrollment
                WHERE classroom_id = $1 AND estado = 'ACTIVA') AS matriculas`,
      [salonCo],
    );

    await aprobarCambioFestivo({
      actorUserId: ec1.userId,
      childPersonId: ec1.ninoId,
      countryScope: null,
      pais: "CO",
      fecha: fechaCo,
      sessionId: sesionDestino,
      autorizarSobrecupo: false,
      puedeSobrecupo: false,
    });

    // Un solo agendado en total, y es del niño de Ecuador.
    const filas = await queryOne<{ total: number; deEc1: number; deDestino: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE child_person_id = $1)::int AS "deEc1",
              count(*) FILTER (WHERE classroom_id = $2)::int AS "deDestino"
         FROM scheduling_agendado WHERE child_person_id = ANY($3) AND estado = 'ACTIVA'`,
      [ec1.ninoId, salonDestino, chicos.map((x) => x.ninoId)],
    );
    expect(filas).toEqual({ total: 1, deEc1: 1, deDestino: 1 });

    // Su salón, sus clases, su matrícula y la de su compañero colombiano, intactos.
    const despues = await queryOne<{ sesiones: number; matriculas: number }>(
      `SELECT (SELECT count(*)::int FROM scheduling_session WHERE classroom_id = $1) AS sesiones,
              (SELECT count(*)::int FROM enrollment_enrollment
                WHERE classroom_id = $1 AND estado = 'ACTIVA') AS matriculas`,
      [salonCo],
    );
    expect(despues).toEqual(antes);
    const mat = await queryOne<{ salon: string }>(
      `SELECT classroom_id::text AS salon FROM enrollment_enrollment
        WHERE child_person_id = $1 AND estado = 'ACTIVA'`,
      [ec1.ninoId],
    );
    expect(mat?.salon).toBe(salonCo);
  });
});
