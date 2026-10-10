import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, ValidationError } from "@/platform/errors";
import { crearSalon } from "../application/gestion-salones";
import {
  crearWelcome,
  detalleWelcome,
  eliminarWelcome,
  marcarAsistenciaWelcome,
  reservarWelcomeTx,
  welcomeDeNino,
  welcomesDisponibles,
} from "../application/welcome";

/**
 * WELCOME (2026-10-09): la sesión de bienvenida que el niño agenda al crear su
 * perfil. Lo que se fija aquí:
 *  - es SIEMPRE antes de que empiece el curso;
 *  - la hora es un INSTANTE, escrita en el reloj de quien lo crea;
 *  - cada niño ve solo los de su campaña/país/curso/salón y su nivel;
 *  - el cupo no se sobrevende y cambiar de Welcome libera el anterior.
 *
 * `creado_por` y `guia_user_id` son claves foráneas: el actor es `sistema-lgs`.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);

/** Fecha UTC de hoy + n días. */
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.runIf(RUN)("Welcome (integración)", () => {
  let actor: string;
  let campaniaId: string;
  let junior: string;
  let youngster: string;
  const ninos: string[] = [];
  const welcomes: string[] = [];

  const reservar = (welcomeId: string, childPersonId: string, classroomId: string) =>
    withTransaction((tx) =>
      reservarWelcomeTx(tx, {
        welcomeId,
        childPersonId,
        classroomId,
        nivel: "ROOKIE",
        agendadoPor: null,
      }),
    );

  const nuevo = async (input: Partial<Parameters<typeof crearWelcome>[0]> = {}) => {
    const r = await crearWelcome({
      actorUserId: actor,
      fecha: dias(10),
      horaLocal: "15:00",
      zona: "America/Bogota",
      duracionMin: 60,
      guiaUserId: actor,
      campaignId: campaniaId,
      pais: null,
      curso: null,
      classroomId: null,
      nivel: "ROOKIE",
      limiteUsuarios: 5,
      ...input,
    });
    welcomes.push(r.id);
    return r.id;
  };

  beforeAll(async () => {
    actor = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    // El curso empieza dentro de 30 días: el Welcome tiene que ser antes.
    campaniaId = (
      await crearCampania({
        actorUserId: actor,
        nombre: `Welcome ${marca}`,
        inicio: dias(0),
        cursoInicio: dias(30),
      })
    ).id;
    const curso = async (tipo: string) =>
      (
        await queryOne<{ id: string }>(
          `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = $2`,
          [campaniaId, tipo],
        )
      )?.id ?? "";
    junior = (
      await crearSalon({
        actorUserId: actor,
        courseId: await curso("JUNIOR"),
        nombre: `Welcome Jr ${marca}`,
        cupo: 10,
        timezone: "America/Santiago",
        holidayCountry: "CL",
        slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    youngster = (
      await crearSalon({
        actorUserId: actor,
        courseId: await curso("YOUNGSTER"),
        nombre: `Welcome Yg ${marca}`,
        cupo: 10,
        timezone: "America/Bogota",
        holidayCountry: "CO",
        slots: [{ tipo: "SESION", diaSemana: 3, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    for (const n of [1, 2, 3]) {
      const id = randomUUID();
      await execute(
        `INSERT INTO people_person (id, nombres, apellidos, doc_tipo, doc_numero, country_code, updated_at)
         VALUES ($1, 'Niño', $2, 'TI', $3, 'CL', now())`,
        [id, `Welcome${marca}`, `W${marca}-${String(n)}`],
      );
      ninos.push(id);
    }
  });

  afterAll(async () => {
    await execute(`DELETE FROM scheduling_welcome WHERE id = ANY($1)`, [welcomes]);
    await execute(`DELETE FROM people_person WHERE id = ANY($1)`, [ninos]);
    for (const cl of [junior, youngster]) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [cl]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [cl]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [cl]);
    }
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("se hace antes de que empiece el curso, y en el futuro", async () => {
    await expect(nuevo({ fecha: dias(40) })).rejects.toBeInstanceOf(ValidationError);
    await expect(nuevo({ fecha: dias(-1) })).rejects.toBeInstanceOf(ValidationError);
    // Un salón que no cuadra con el curso elegido tampoco tiene a quién servir.
    await expect(nuevo({ curso: "JUNIOR", classroomId: youngster })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("la hora es un instante: 15:00 de Bogotá son las 20:00 UTC", async () => {
    const id = await nuevo();
    const { welcome } = await detalleWelcome(id);
    expect(new Date(welcome.startsAt).toISOString()).toBe(`${dias(10)}T20:00:00.000Z`);
  });

  it("cada niño ve solo los de su curso, país y nivel", async () => {
    const soloJunior = await nuevo({ curso: "JUNIOR", pais: "CL" });
    const deJunior = await welcomesDisponibles({ classroomId: junior, nivel: "ROOKIE" });
    const deYoungster = await welcomesDisponibles({ classroomId: youngster, nivel: "ROOKIE" });
    const champion = await welcomesDisponibles({ classroomId: junior, nivel: "CHAMPION" });
    expect(deJunior.map((w) => w.id)).toContain(soloJunior);
    expect(deYoungster.map((w) => w.id)).not.toContain(soloJunior);
    expect(champion.map((w) => w.id)).not.toContain(soloJunior);
    // Y la reserva aplica la MISMA regla que la lista.
    await expect(reservar(soloJunior, ninos[2] as string, youngster)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("no se sobrevende, y cambiar de Welcome libera el cupo anterior", async () => {
    const chico = await nuevo({ limiteUsuarios: 1 });
    const grande = await nuevo({ fecha: dias(11) });
    const [a, b] = ninos as [string, string];

    await reservar(chico, a, junior);
    await expect(reservar(chico, b, junior)).rejects.toBeInstanceOf(ConflictError);
    const lleno = (await welcomesDisponibles({ classroomId: junior, nivel: "ROOKIE" })).find(
      (w) => w.id === chico,
    );
    expect(lleno?.libres).toBe(0);

    // `a` se cambia: deja el cupo libre y `b` puede tomarlo.
    await reservar(grande, a, junior);
    expect((await welcomeDeNino(a))?.welcomeId).toBe(grande);
    await reservar(chico, b, junior);
    expect((await detalleWelcome(chico)).inscritos.map((i) => i.childPersonId)).toEqual([b]);

    // Reservar el mismo otra vez no duplica.
    await reservar(grande, a, junior);
    expect((await detalleWelcome(grande)).welcome.inscritos).toBe(1);
  });

  it("se pasa lista solo a quien lo agendó, y no se borra con niños dentro", async () => {
    const id = await nuevo({ fecha: dias(12) });
    const [, , c] = ninos as [string, string, string];
    await reservar(id, c, junior);
    const r = await marcarAsistenciaWelcome({
      actorUserId: actor,
      id,
      marcas: [
        { childPersonId: c, asistio: true },
        { childPersonId: randomUUID(), asistio: true },
      ],
    });
    expect(r.marcados).toBe(1);
    expect((await detalleWelcome(id)).inscritos[0]?.asistio).toBe(true);
    await expect(eliminarWelcome({ actorUserId: actor, id })).rejects.toBeInstanceOf(ConflictError);
  });
});
