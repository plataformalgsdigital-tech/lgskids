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
import { aprobarCambioFestivo } from "../application/gestion-festivos";

/**
 * GESTIÓN FESTIVOS vale para LAS CUATRO operaciones, no solo Colombia/Ecuador: para
 * cada país X (CL, CO, EC, PE) con un salón de calendario X y un niño de cada país,
 * el feriado de X deja como afectados a los niños de los OTROS tres, y al de X no.
 * Y si el país del niño también tiene feriado ese día (aquí CL y PE el mismo día), ese
 * niño está de feriado y no se toca.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const SISTEMA = "00000000-0000-0000-0000-000000000000";

const PAISES = ["CL", "CO", "EC", "PE"] as const;
const ZONA: Record<string, string> = {
  CL: "America/Santiago",
  CO: "America/Bogota",
  EC: "America/Guayaquil",
  PE: "America/Lima",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumar = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

interface Chico {
  pais: string;
  ninoId: string;
  apoderadoId: string;
  contractId: string;
  userId: string;
}

describe.runIf(RUN)("gestión de festivos en CL, CO, EC y PE (integración)", () => {
  let campaniaId = "";
  const salonDe: Record<string, string> = {};
  const fechaDe: Record<string, string> = {};
  const chicosDe: Record<string, Record<string, Chico>> = {};
  const todos: Chico[] = [];
  let salonCompartido = "";
  let fechaCompartida = "";
  let chicosCompartido: Record<string, Chico> = {};

  async function diaLibre(desde: number): Promise<string> {
    for (let i = 0; i < 6; i++) {
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
        apellidos: `Paises${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-01-10`,
        docTipo: "TI",
        docNumero: `P-${marca}-${tag}`,
        countryCode: pais,
      },
      apoderadoNuevo: {
        nombres: "Madre",
        apellidos: `Paises${marca}${tag}`,
        docTipo: "CC",
        docNumero: `P-${marca}-${tag}-A`,
        countryCode: pais,
        email: `madre-p-${tag}-${marca}@prueba.lgs`,
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
    const c = { pais, ninoId: p.ninoId, apoderadoId: p.apoderadoId, contractId, userId };
    todos.push(c);
    return c;
  }

  beforeAll(async () => {
    // Un feriado de prueba por país, cada uno en SU día (sin feriado real ese día) y
    // uno compartido por CL y PE. Se insertan ANTES de crear los salones.
    let desde = 85;
    for (const x of PAISES) {
      fechaDe[x] = await diaLibre(desde);
      desde = Math.round((new Date(fechaDe[x]!).getTime() - Date.now()) / 86_400_000) + 2;
    }
    fechaCompartida = await diaLibre(desde);
    for (const x of PAISES) {
      await execute(
        `INSERT INTO scheduling_holiday (country_code, fecha, nombre, fuente)
         VALUES ($1, $2::date, $3, 'prueba')`,
        [x, fechaDe[x], `Festivo paises ${marca}`],
      );
    }
    for (const x of ["CL", "PE"]) {
      await execute(
        `INSERT INTO scheduling_holiday (country_code, fecha, nombre, fuente)
         VALUES ($1, $2::date, $3, 'prueba')`,
        [x, fechaCompartida, `Festivo paises ${marca}`],
      );
    }

    const hoy = iso(new Date());
    const c = await crearCampania({
      actorUserId: SISTEMA,
      nombre: `IT Paises ${marca}`,
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
    const salon = async (nombre: string, pais: string, fecha: string) =>
      (
        await crearSalon({
          actorUserId: SISTEMA,
          courseId: curso,
          nombre,
          cupo: 8,
          timezone: ZONA[pais]!,
          holidayCountry: pais,
          slots: [
            {
              tipo: "SESION",
              diaSemana: new Date(`${fecha}T12:00:00Z`).getUTCDay(),
              horaLocal: "15:00",
              duracionMin: 60,
            },
          ],
        })
      ).id;

    for (const x of PAISES) {
      salonDe[x] = await salon(`IT ${x} ${marca}`, x, fechaDe[x]!);
      chicosDe[x] = {};
      for (const y of PAISES) chicosDe[x]![y] = await chico(y, `${x}${y}`, salonDe[x]!);
    }
    // Salón chileno con el feriado compartido CL+PE: niños de CL, PE y CO.
    salonCompartido = await salon(`IT CLPE ${marca}`, "CL", fechaCompartida);
    for (const y of ["CL", "PE", "CO"]) {
      chicosCompartido[y] = await chico(y, `Z${y}`, salonCompartido);
    }
    chicosCompartido = { ...chicosCompartido };
  }, 180_000);

  afterAll(async () => {
    const ninos = todos.flatMap((x) => [x.ninoId, x.apoderadoId]);
    await execute(`DELETE FROM scheduling_agendado WHERE child_person_id = ANY($1)`, [ninos]);
    await execute(`DELETE FROM enrollment_enrollment WHERE contract_id = ANY($1)`, [
      todos.map((x) => x.contractId),
    ]);
    await execute(`DELETE FROM contracts_contract WHERE id = ANY($1)`, [
      todos.map((x) => x.contractId),
    ]);
    for (const id of [...Object.values(salonDe), salonCompartido].filter((s) => s !== "")) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM people_person WHERE id = ANY($1)`, [ninos]);
    await execute(`DELETE FROM identity_user WHERE id = ANY($1)`, [
      todos.map((x) => x.userId).filter((u) => u !== ""),
    ]);
    if (campaniaId !== "")
      await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await execute(`DELETE FROM scheduling_holiday WHERE fuente = 'prueba' AND nombre LIKE $1`, [
      `%${marca}`,
    ]);
    await closePool();
  });

  for (const x of PAISES) {
    it(`feriado de ${x}: afecta a los niños de los otros tres países y no al de ${x}`, async () => {
      const f = (await festivosProximos({ dias: 150, countryScope: null })).find(
        (e) => e.pais === x && e.fecha === fechaDe[x],
      );
      const salon = f?.salones.find((s) => s.id === salonDe[x]);
      expect(salon).toBeDefined();
      const afectados = new Set(f?.alumnos.map((a) => a.childPersonId));
      for (const y of PAISES) {
        const id = chicosDe[x]![y]!.ninoId;
        if (y === x) expect(afectados.has(id), `${y} en salón ${x}`).toBe(false);
        else expect(afectados.has(id), `${y} en salón ${x}`).toBe(true);
      }
      expect(salon?.ninosOtroPais).toBe(3);
      expect(salon?.ninosMismoPais).toBe(1);

      // Al del país del feriado no se le puede aprobar nada.
      const propio = chicosDe[x]![x]!;
      await expect(
        aprobarCambioFestivo({
          actorUserId: propio.userId,
          childPersonId: propio.ninoId,
          countryScope: null,
          pais: x,
          fecha: fechaDe[x]!,
          sessionId: randomUUID(),
          amplio: true,
          autorizarSobrecupo: false,
          puedeSobrecupo: false,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  }

  it("feriado compartido CL+PE: el niño de Perú también está de feriado; el de Colombia no", async () => {
    const f = (await festivosProximos({ dias: 150, countryScope: null })).find(
      (e) => e.pais === "CL" && e.fecha === fechaCompartida,
    );
    const afectados = new Set(f?.alumnos.map((a) => a.childPersonId));
    expect(afectados.has(chicosCompartido["CL"]!.ninoId)).toBe(false);
    expect(afectados.has(chicosCompartido["PE"]!.ninoId)).toBe(false);
    expect(afectados.has(chicosCompartido["CO"]!.ninoId)).toBe(true);
    const salon = f?.salones.find((s) => s.id === salonCompartido);
    expect(salon?.ninosOtroPais).toBe(1);
    expect(salon?.ninosMismoPais).toBe(2);
  });
});
