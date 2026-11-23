import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { crearNino } from "@/modules/people";
import {
  crearFeriadoPropio,
  crearSalon,
  feriadosDelMes,
  feriadosDelPais,
  previoFeriadoPropio,
  quitarFeriadoPropio,
  regenerarSalonPendiente,
  salonesPendientesDeFeriados,
} from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { ConflictError, ValidationError } from "@/platform/errors";
import { aprobarContrato, crearContrato } from "../application/gestion-contratos";

/**
 * FERIADOS PROPIOS. Un feriado de una fecha concreta y uno o varios países. Se fija:
 *  - el previo dice qué salones cambian y cuáles NO se pueden tocar (contrato);
 *  - crear ajusta SOLO lo futuro: las sesiones anteriores conservan su id (la asistencia
 *    cuelga de ellas con ON DELETE CASCADE);
 *  - la sesión del día se quita y se agrega una al final: el total se conserva;
 *  - un salón cuya última sesión pasaría del contrato de un niño no se toca y queda
 *    PENDIENTE (derivado); al ampliar el contrato, "Regenerar" lo aplica;
 *  - quitar el feriado devuelve las sesiones; solo se quitan los propios y futuros.
 *
 * Se usa ECUADOR y un DOMINGO: ningún salón real es de Ecuador ni dicta ese día, y ninguna
 * otra prueba inserta feriados de Ecuador (la de Gestión Festivos pone uno chileno en
 * hoy+20 días, que según el día del calendario cae en domingo y se colaba en el calendario
 * de estos salones). Así un feriado de prueba no
 * mueve nada de los demás datos de la base.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const SISTEMA = "00000000-0000-0000-0000-000000000000";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumar = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

// Recorre los salones del país en una base compartida y con otros archivos en paralelo.
describe.runIf(RUN)("feriados propios (integración)", { timeout: 30_000 }, () => {
  let campania = "";
  let salonConNino = "";
  let salonVacio = "";
  let ninoId = "";
  let apoderadoId = "";
  let contractId = "";
  let actor = "";
  let fecha = "";

  const sesiones = (classroomId: string) =>
    queryRows<{ id: string; fecha: string; numero: number }>(
      `SELECT id::text AS id, fecha::text AS fecha, numero FROM scheduling_session
        WHERE classroom_id = $1 AND slot_id IS NOT NULL ORDER BY starts_at`,
      [classroomId],
    );

  beforeAll(async () => {
    // El primer domingo desde hoy+110 sin ningún feriado real.
    const base = sumar(new Date(), 110);
    for (let i = 0; i < 40 && fecha === ""; i++) {
      const d = sumar(base, i);
      if (d.getUTCDay() !== 0) continue;
      // Ni un feriado oficial de Ecuador: la generación lo respetaría y el día no cambiaría.
      if (feriadosDelPais("EC", d.getUTCFullYear()).some((x) => x.fecha === iso(d))) {
        continue;
      }
      const hay = await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM scheduling_holiday WHERE fecha = $1::date`,
        [iso(d)],
      );
      if (hay?.n === 0) fecha = iso(d);
    }

    const hoy = iso(new Date());
    const c = await crearCampania({
      actorUserId: SISTEMA,
      nombre: `IT Feriado ${marca}`,
      inicio: hoy,
      cursoInicio: hoy,
    });
    campania = c.id;
    const curso = (
      await queryOne<{ id: string }>(
        `SELECT id::text AS id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
        [c.id],
      )
    )?.id as string;

    const salon = async (nombre: string, hora: string) =>
      (
        await crearSalon({
          actorUserId: SISTEMA,
          courseId: curso,
          nombre,
          cupo: 5,
          timezone: "America/Guayaquil",
          holidayCountry: "EC",
          slots: [{ tipo: "SESION", diaSemana: 0, horaLocal: hora, duracionMin: 60 }],
        })
      ).id;
    salonConNino = await salon(`IT FP con niño ${marca}`, "10:00");
    salonVacio = await salon(`IT FP vacío ${marca}`, "11:00");

    const personas = await crearNino({
      actorUserId: SISTEMA,
      nino: {
        nombres: "Feriado",
        apellidos: `Propio${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-01-10`,
        docTipo: "TI",
        docNumero: `FP-${marca}-N`,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: "Madre",
        apellidos: `Propio${marca}`,
        docTipo: "CC",
        docNumero: `FP-${marca}-A`,
        countryCode: "CO",
        email: `madre-fp-${marca}@prueba.lgs`,
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
      classroomId: salonConNino,
      enviarPerfil: false,
    });
    actor =
      (
        await queryOne<{ userId: string }>(
          `SELECT user_id AS "userId" FROM people_person WHERE id = $1`,
          [ninoId],
        )
      )?.userId ?? "";
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_holiday WHERE fecha = $1::date AND fuente = 'MANUAL'`, [
      fecha,
    ]);
    await execute(`DELETE FROM enrollment_enrollment WHERE contract_id = $1`, [contractId]);
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    for (const id of [salonConNino, salonVacio]) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM people_person WHERE id = ANY($1)`, [[ninoId, apoderadoId]]);
    if (actor !== "") await execute(`DELETE FROM identity_user WHERE id = $1`, [actor]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campania]);
    await closePool();
  });

  it("antes de empezar, las dos sesiones del domingo existen", async () => {
    expect(fecha).not.toBe("");
    for (const id of [salonConNino, salonVacio]) {
      expect((await sesiones(id)).some((s) => s.fecha === fecha)).toBe(true);
    }
  });

  it("el previo dice qué salón cambia y cuál NO se puede tocar por el contrato", async () => {
    const p = await previoFeriadoPropio({
      accion: "AGREGAR",
      fecha,
      paises: ["EC"],
      countryScope: null,
    });
    const vacio = p.salones.find((s) => s.id === salonVacio);
    const conNino = p.salones.find((s) => s.id === salonConNino);
    expect(vacio?.aplicable).toBe(true);
    expect(vacio?.quita).toEqual([fecha]);
    expect(vacio?.agrega).toHaveLength(1);
    expect((vacio?.finNuevo ?? "") > (vacio?.finActual ?? "")).toBe(true);
    expect(conNino?.aplicable).toBe(false);
    expect(conNino?.conflictos).toHaveLength(1);
    expect(p.ninosOtroPais).toBe(1); // el niño colombiano en un salón ecuatoriano
  });

  it("exige nombre, fecha futura y un país válido", async () => {
    const base = { actorUserId: SISTEMA, countryScope: null, fecha, paises: ["EC"] };
    await expect(crearFeriadoPropio({ ...base, nombre: "  " })).rejects.toThrow(ValidationError);
    await expect(
      crearFeriadoPropio({ ...base, nombre: "Pasado", fecha: iso(sumar(new Date(), -3)) }),
    ).rejects.toThrow(ValidationError);
    await expect(crearFeriadoPropio({ ...base, nombre: "Mal", paises: ["XX"] })).rejects.toThrow(
      ValidationError,
    );
  });

  it("crear ajusta SOLO lo futuro, conserva el total y deja pendiente al salón con conflicto", async () => {
    const antesVacio = await sesiones(salonVacio);
    const antesNino = await sesiones(salonConNino);

    const r = await crearFeriadoPropio({
      actorUserId: SISTEMA,
      countryScope: null,
      fecha,
      nombre: `Feriado de prueba ${marca}`,
      paises: ["EC"],
    });
    expect(r.regenerados.map((s) => s.id)).toContain(salonVacio);
    expect(r.pendientes.map((s) => s.id)).toContain(salonConNino);

    const despues = await sesiones(salonVacio);
    expect(despues.some((s) => s.fecha === fecha)).toBe(false);
    // El total se conserva: se agregó una al final.
    expect(despues).toHaveLength(antesVacio.length);
    // Lo anterior al feriado conserva su id (no se borró ni se recreó).
    const previas = (l: typeof despues) => l.filter((s) => s.fecha < fecha).map((s) => s.id);
    expect(previas(despues)).toEqual(previas(antesVacio));
    // Numeración 1..N sin saltos.
    expect(despues.map((s) => s.numero)).toEqual(despues.map((_, i) => i + 1));
    const ultima = (l: typeof despues) => l[l.length - 1]?.fecha ?? "";
    expect(ultima(despues) > ultima(antesVacio)).toBe(true);

    // El salón con el niño NO se tocó.
    expect(await sesiones(salonConNino)).toEqual(antesNino);

    // El feriado queda como PROPIO y el pendiente se deriva.
    const delMes = await feriadosDelMes(fecha.slice(0, 7));
    const f = delMes.find((x) => x.fecha === fecha && x.pais === "EC");
    expect(f?.propio).toBe(true);
    expect(f?.nombre).toContain(marca);
    const pend = await salonesPendientesDeFeriados(null);
    expect(pend.some((p) => p.id === salonConNino)).toBe(true);
    expect(pend.some((p) => p.id === salonVacio)).toBe(false);
  });

  it("no se vuelve a crear el mismo feriado", async () => {
    await expect(
      crearFeriadoPropio({
        actorUserId: SISTEMA,
        countryScope: null,
        fecha,
        nombre: "Otra vez",
        paises: ["EC"],
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("regenerar el pendiente falla mientras el contrato lo impida y funciona al ampliarlo", async () => {
    await expect(
      regenerarSalonPendiente({
        actorUserId: SISTEMA,
        countryScope: null,
        classroomId: salonConNino,
      }),
    ).rejects.toThrow(ConflictError);

    await execute(
      `UPDATE contracts_contract SET final_contrato = final_contrato + 90 WHERE id = $1`,
      [contractId],
    );
    await regenerarSalonPendiente({
      actorUserId: SISTEMA,
      countryScope: null,
      classroomId: salonConNino,
    });
    expect((await sesiones(salonConNino)).some((s) => s.fecha === fecha)).toBe(false);
    expect((await salonesPendientesDeFeriados(null)).some((p) => p.id === salonConNino)).toBe(
      false,
    );
  });

  it("quitar el feriado propio devuelve las sesiones; solo se quitan los propios y futuros", async () => {
    await expect(
      quitarFeriadoPropio({
        actorUserId: SISTEMA,
        countryScope: null,
        fecha,
        paises: ["CO"], // en Colombia ese día no hay feriado propio
      }),
    ).rejects.toThrow(ConflictError);

    const r = await quitarFeriadoPropio({
      actorUserId: SISTEMA,
      countryScope: null,
      fecha,
      paises: ["EC"],
    });
    expect(r.regenerados.map((s) => s.id)).toEqual(
      expect.arrayContaining([salonVacio, salonConNino]),
    );
    for (const id of [salonVacio, salonConNino]) {
      expect((await sesiones(id)).some((s) => s.fecha === fecha)).toBe(true);
    }
    const f = (await feriadosDelMes(fecha.slice(0, 7))).find(
      (x) => x.fecha === fecha && x.pais === "EC",
    );
    expect(f).toBeUndefined();
  });

  it("el alcance por país del rol limita qué país se puede crear", async () => {
    await expect(
      previoFeriadoPropio({
        accion: "AGREGAR",
        fecha,
        paises: ["EC"],
        countryScope: ["CO"],
      }),
    ).rejects.toThrow();
  });
});
