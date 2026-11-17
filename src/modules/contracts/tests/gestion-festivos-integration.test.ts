import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { crearNino } from "@/modules/people";
import { crearSalon, festivosProximos } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ConflictError, NotFoundError } from "@/platform/errors";
import { aprobarCambioFestivo, sugerenciasFestivo } from "../application/gestion-festivos";
import { aprobarContrato, crearContrato } from "../application/gestion-contratos";

/**
 * GESTIÓN FESTIVOS. Un salón con calendario de CHILE no dicta la clase del feriado
 * chileno; el niño COLOMBIANO que está en él se queda sin clase aunque en su país no
 * sea feriado. Se fija:
 *  - el feriado sale con el salón, el curso y el niño de OTRO país (no con los del país);
 *  - las sugerencias son las clases de ESE día de su campaña y curso; con `amplio`, las
 *    de cualquier campaña;
 *  - aprobar es agendar, con el motivo del feriado, y no se repite;
 *  - un feriado que no existe, o que no deja sin clase a ese niño, se rechaza.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const SISTEMA = "00000000-0000-0000-0000-000000000000";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumar = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

describe.runIf(RUN)("gestión de festivos (integración)", () => {
  let campania1: string;
  let campania2: string;
  let salonChile: string; // calendario CL, donde está el niño colombiano
  let salonCol: string; // calendario CO, misma campaña y curso
  let salonOtraCampania: string; // calendario CO, OTRA campaña
  let ninoId: string;
  let apoderadoId: string;
  let contractId: string;
  let actor = "";
  let fecha = ""; // el feriado de prueba (CL)
  let sesionCol = "";
  let sesionOtra = "";
  let perdida = "";

  beforeAll(async () => {
    // Un día futuro sin feriado real en ningún país, para no pisar datos de verdad.
    const base = sumar(new Date(), 20);
    for (let i = 0; i < 15 && fecha === ""; i++) {
      const d = iso(sumar(base, i));
      const hay = await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM scheduling_holiday WHERE fecha = $1::date`,
        [d],
      );
      if (hay?.n === 0) fecha = d;
    }
    const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    // El feriado se inserta ANTES de crear los salones: la generación lo respeta.
    await execute(
      `INSERT INTO scheduling_holiday (country_code, fecha, nombre, fuente)
       VALUES ('CL', $1::date, $2, 'prueba')`,
      [fecha, `Festivo de prueba ${marca}`],
    );

    const hoy = iso(new Date());
    const crear = async (nombre: string) => {
      const c = await crearCampania({
        actorUserId: SISTEMA,
        nombre,
        inicio: hoy,
        cursoInicio: hoy,
      });
      const curso = await queryOne<{ junior: string }>(
        `SELECT id::text AS junior FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
        [c.id],
      );
      return { id: c.id, curso: curso?.junior ?? "" };
    };
    const c1 = await crear(`IT Festivo ${marca}`);
    const c2 = await crear(`IT Festivo2 ${marca}`);
    campania1 = c1.id;
    campania2 = c2.id;

    const salon = async (
      courseId: string,
      nombre: string,
      pais: string,
      tz: string,
      hora: string,
    ) =>
      (
        await crearSalon({
          actorUserId: SISTEMA,
          courseId,
          nombre,
          cupo: 5,
          timezone: tz,
          holidayCountry: pais,
          slots: [{ tipo: "SESION", diaSemana: dia, horaLocal: hora, duracionMin: 60 }],
        })
      ).id;
    salonChile = await salon(c1.curso, `IT CL ${marca}`, "CL", "America/Santiago", "17:00");
    salonCol = await salon(c1.curso, `IT CO ${marca}`, "CO", "America/Bogota", "15:00");
    salonOtraCampania = await salon(c2.curso, `IT CO2 ${marca}`, "CO", "America/Bogota", "15:00");

    const personas = await crearNino({
      actorUserId: SISTEMA,
      nino: {
        nombres: "Festivo",
        apellidos: `Prueba${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-01-10`,
        docTipo: "TI",
        docNumero: `F-${marca}-N`,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: "Madre",
        apellidos: `Prueba${marca}`,
        docTipo: "CC",
        docNumero: `F-${marca}-A`,
        countryCode: "CO",
        email: `madre-f-${marca}@prueba.lgs`,
      },
      parentesco: "MADRE",
    });
    ninoId = personas.ninoId;
    apoderadoId = personas.apoderadoId;
    contractId = await crearContrato({
      actorUserId: SISTEMA,
      titularId: apoderadoId,
      beneficiarioId: ninoId,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: hoy,
    });
    await aprobarContrato({
      actorUserId: SISTEMA,
      contractId,
      classroomId: salonChile,
      enviarPerfil: false,
    });
    // agendado_por es clave foránea: se usa la cuenta real del niño como actor.
    actor =
      (
        await queryOne<{ userId: string }>(
          `SELECT user_id AS "userId" FROM people_person WHERE id = $1`,
          [ninoId],
        )
      )?.userId ?? "";

    const ses = async (classroomId: string) =>
      (
        await queryOne<{ id: string }>(
          `SELECT s.id::text AS id FROM scheduling_session s
             JOIN scheduling_classroom cl ON cl.id = s.classroom_id
            WHERE s.classroom_id = $1 AND (s.starts_at AT TIME ZONE cl.timezone)::date = $2::date`,
          [classroomId, fecha],
        )
      )?.id ?? "";
    sesionCol = await ses(salonCol);
    sesionOtra = await ses(salonOtraCampania);
    perdida =
      (
        await queryOne<{ t: string }>(
          `SELECT (($1::date + time '17:00') AT TIME ZONE 'America/Santiago')::text AS t`,
          [fecha],
        )
      )?.t ?? "";
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_agendado WHERE child_person_id = $1`, [ninoId]);
    await execute(`DELETE FROM enrollment_enrollment WHERE contract_id = $1`, [contractId]);
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    for (const id of [salonChile, salonCol, salonOtraCampania]) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM people_person WHERE id = ANY($1)`, [[ninoId, apoderadoId]]);
    if (actor !== "") await execute(`DELETE FROM identity_user WHERE id = $1`, [actor]);
    await execute(`DELETE FROM catalog_campaign WHERE id = ANY($1)`, [[campania1, campania2]]);
    await execute(`DELETE FROM scheduling_holiday WHERE fuente = 'prueba' AND nombre LIKE $1`, [
      `%${marca}`,
    ]);
    await closePool();
  });

  it("el feriado sale con el salón, el curso y el niño de OTRO país", async () => {
    expect(sesionCol).not.toBe(""); // el salón colombiano SÍ dicta ese día
    const lista = await festivosProximos({ dias: 90, countryScope: null });
    const f = lista.find((x) => x.pais === "CL" && x.fecha === fecha);
    expect(f?.nombre).toContain(marca);
    const salon = f?.salones.find((s) => s.id === salonChile);
    expect(salon?.curso).toBe("JUNIOR");
    expect(salon?.ninosOtroPais).toBe(1);
    expect(f?.cursos).toContain("JUNIOR");
    // El salón colombiano no es del calendario chileno: ese día sí dicta.
    expect(f?.salones.find((s) => s.id === salonCol)).toBeUndefined();
    const a = f?.alumnos.find((x) => x.childPersonId === ninoId);
    expect(a?.pais).toBe("CO");
    expect(a?.agendado).toBeNull();
  });

  it("el alcance por país acota a los niños", async () => {
    const lista = await festivosProximos({ dias: 90, countryScope: ["CL"] });
    const f = lista.find((x) => x.pais === "CL" && x.fecha === fecha);
    expect(f?.alumnos.find((x) => x.childPersonId === ninoId)).toBeUndefined();
  });

  it("sugiere las clases de ese día de su campaña y curso; con `amplio`, las de otra campaña", async () => {
    const normal = await sugerenciasFestivo({
      childPersonId: ninoId,
      countryScope: null,
      fecha,
      perdidaStartsAt: perdida,
      classroomId: salonChile,
    });
    expect(normal.opciones.map((o) => o.id)).toContain(sesionCol);
    expect(normal.opciones.map((o) => o.id)).not.toContain(sesionOtra);
    const mejor = normal.opciones.find((o) => o.id === sesionCol);
    expect(mejor?.recomendada).toBe(true);
    expect(mejor?.choque).toBeNull();

    const amplio = await sugerenciasFestivo({
      childPersonId: ninoId,
      countryScope: null,
      fecha,
      perdidaStartsAt: perdida,
      classroomId: salonChile,
      amplio: true,
    });
    const ids = amplio.opciones.map((o) => o.id);
    expect(ids).toContain(sesionCol);
    expect(ids).toContain(sesionOtra);
    expect(amplio.opciones.find((o) => o.id === sesionOtra)?.campaignId).toBe(campania2);
  });

  it("aprobar agenda la clase con el motivo del feriado, y no se repite", async () => {
    const r = await aprobarCambioFestivo({
      actorUserId: actor,
      childPersonId: ninoId,
      countryScope: null,
      pais: "CL",
      fecha,
      sessionId: sesionCol,
      autorizarSobrecupo: false,
      puedeSobrecupo: false,
    });
    expect(r.sobrecupo).toBe(false);
    const fila = await queryOne<{ motivo: string; tipo: string }>(
      `SELECT motivo, tipo FROM scheduling_agendado WHERE child_person_id = $1 AND estado = 'ACTIVA'`,
      [ninoId],
    );
    expect(fila?.tipo).toBe("REGULAR");
    expect(fila?.motivo).toContain("Festivo CL");

    // La pantalla lo ve resuelto: la clase que tomará.
    const f = (await festivosProximos({ dias: 90, countryScope: null })).find(
      (x) => x.pais === "CL" && x.fecha === fecha,
    );
    const a = f?.alumnos.find((x) => x.childPersonId === ninoId);
    expect(a?.agendado?.salon).toBe(`IT CO ${marca}`);

    await expect(
      aprobarCambioFestivo({
        actorUserId: actor,
        childPersonId: ninoId,
        countryScope: null,
        pais: "CL",
        fecha,
        sessionId: sesionCol,
        autorizarSobrecupo: false,
        puedeSobrecupo: false,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rechaza un feriado que no existe o que no deja sin clase a ese niño", async () => {
    // Sin feriado de PE ese día.
    await expect(
      aprobarCambioFestivo({
        actorUserId: actor,
        childPersonId: ninoId,
        countryScope: null,
        pais: "PE",
        fecha,
        sessionId: sesionOtra,
        amplio: true,
        autorizarSobrecupo: false,
        puedeSobrecupo: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
