import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listaDeSesion } from "@/modules/attendance";
import { crearCampania } from "@/modules/catalog";
import { crearNino } from "@/modules/people";
import { crearEvento, crearSalon, editarEvento } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/platform/errors";
import { newId } from "@/platform/ids";
import { aprobarContrato, crearContrato } from "../application/gestion-contratos";
import {
  agendaDeNino,
  agendarParaNino,
  cancelarAgendadoNino,
  cancelarClubPropio,
  clubesPropios,
  inscribirClubPropio,
  opcionesAgendaNino,
} from "../application/perfil-nino";

/**
 * AGENDAR desde la ficha (Academic management): lo que el niño puede tomar fuera
 * de su salón y cómo entra en la lista de ESA sesión.
 *  - clase REGULAR: solo de su misma campaña y curso;
 *  - sesión/club/taller: solo si está ABIERTO y su alcance (campaña, curso,
 *    salón; null = Todos) le coincide;
 *  - lo de su propio salón ya lo tiene ("en su lista");
 *  - choque con lo que ya tiene a esa hora, y sobrecupo solo con permiso.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const ACTOR = "00000000-0000-0000-0000-000000000000";
const marca = randomUUID().slice(0, 6);
const ZONA = "America/Bogota";

describe.runIf(RUN)("agendar desde la ficha (integración)", () => {
  let campaniaId: string;
  let salonA: string; // el del niño (Junior, martes)
  let salonB: string; // otro Junior (miércoles)
  let salonC: string; // Youngster (miércoles)
  let ninoId: string;
  let apoderadoId: string;
  let contractId: string;
  let actor: string; // un usuario real: agendado_por es clave foránea
  const eventos: string[] = [];

  const hoy = new Date().toISOString().slice(0, 10);
  const diaEn = (instante: Date | string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(instante));

  async function proximaDe(classroomId: string): Promise<{ id: string; startsAt: Date }> {
    const s = await queryOne<{ id: string; startsAt: Date }>(
      `SELECT id, starts_at AS "startsAt" FROM scheduling_session
        WHERE classroom_id = $1 AND slot_id IS NOT NULL AND starts_at > now() + interval '1 day'
        ORDER BY starts_at LIMIT 1`,
      [classroomId],
    );
    if (s === null) throw new Error("sin sesiones");
    return s;
  }

  const nuevoEvento = async (o: {
    salon: string;
    fecha: string;
    hora: string;
    tipo?: "SESION" | "CLUB" | "TALLER";
    limite?: number;
    abierto?: boolean;
    curso?: "JUNIOR" | "YOUNGSTER" | null;
    pais?: "CL" | "CO" | "EC" | "PE" | null;
    nivel?: string | null;
    duracionMin?: number;
  }) => {
    const r = await crearEvento({
      actorUserId: actor,
      classroomIds: [o.salon],
      tipo: o.tipo ?? "CLUB",
      fecha: o.fecha,
      horaLocal: o.hora,
      duracionMin: o.duracionMin ?? 60,
      limiteUsuarios: o.limite ?? null,
      nivel: o.nivel ?? null,
      guiaUserId: actor,
      apertura: {
        abierto: o.abierto ?? true,
        campaignId: campaniaId,
        curso: o.curso ?? null,
        pais: o.pais ?? null,
        classroomId: null,
      },
    });
    const id = r.sesiones[0]!.id;
    eventos.push(id);
    return id;
  };

  const agendar = (tipo: "SESION" | "CLUB" | "TALLER" | "REGULAR", id: string, extra = {}) =>
    agendarParaNino({
      actorUserId: actor,
      childPersonId: ninoId,
      countryScope: null,
      tipo,
      id,
      autorizarSobrecupo: false,
      puedeSobrecupo: false,
      ...extra,
    });

  beforeAll(async () => {
    campaniaId = (
      await crearCampania({
        actorUserId: ACTOR,
        nombre: `IT Agendar ${marca}`,
        inicio: hoy,
        cursoInicio: hoy,
      })
    ).id;
    const cursos = await queryOne<{ junior: string; youngster: string }>(
      `SELECT max(id::text) FILTER (WHERE tipo = 'JUNIOR') AS junior,
              max(id::text) FILTER (WHERE tipo = 'YOUNGSTER') AS youngster
         FROM catalog_course WHERE campaign_id = $1`,
      [campaniaId],
    );
    const salon = async (courseId: string, nombre: string, dia: number) =>
      (
        await crearSalon({
          actorUserId: ACTOR,
          courseId,
          nombre,
          cupo: 5,
          timezone: ZONA,
          holidayCountry: "CO",
          slots: [{ tipo: "SESION", diaSemana: dia, horaLocal: "17:00", duracionMin: 60 }],
        })
      ).id;
    salonA = await salon(cursos?.junior ?? "", `IT AgA ${marca}`, 2);
    salonB = await salon(cursos?.junior ?? "", `IT AgB ${marca}`, 3);
    salonC = await salon(cursos?.youngster ?? "", `IT AgC ${marca}`, 3);

    const personas = await crearNino({
      actorUserId: ACTOR,
      nino: {
        nombres: "Agenda",
        apellidos: `Prueba${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-01-10`,
        docTipo: "TI",
        docNumero: `AG-${marca}-N`,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: "Madre",
        apellidos: `Prueba${marca}`,
        docTipo: "CC",
        docNumero: `AG-${marca}-A`,
        countryCode: "CO",
        email: `ag-${marca}@prueba.lgs`,
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
    await aprobarContrato({
      actorUserId: ACTOR,
      contractId,
      classroomId: salonA,
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
    await execute(`DELETE FROM scheduling_agendado WHERE child_person_id = ANY($1)`, [
      [ninoId, apoderadoId],
    ]);
    await execute(`DELETE FROM enrollment_enrollment WHERE contract_id = $1`, [contractId]);
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    for (const id of [salonA, salonB, salonC]) {
      await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [id]);
      await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [id]);
    }
    await execute(`DELETE FROM people_person WHERE id = ANY($1)`, [[ninoId, apoderadoId]]);
    if (actor !== "") await execute(`DELETE FROM identity_user WHERE id = $1`, [actor]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("clase REGULAR: la de otro salón de su campaña y curso sí; la de otro curso no", async () => {
    const b = await proximaDe(salonB);
    const op = await opcionesAgendaNino({
      childPersonId: ninoId,
      countryScope: null,
      tipo: "REGULAR",
      fecha: diaEn(b.startsAt),
    });
    const deB = op.find((o) => o.id === b.id);
    expect(deB?.enSuLista).toBe(false);
    expect(deB?.lleno).toBe(false);
    // El salón C es Youngster: su clase del mismo día no le corresponde.
    const c = await proximaDe(salonC);
    expect(op.some((o) => o.id === c.id)).toBe(false);
    // Su propia clase sale como "en su lista".
    const a = await proximaDe(salonA);
    const propia = await opcionesAgendaNino({
      childPersonId: ninoId,
      countryScope: null,
      tipo: "REGULAR",
      fecha: diaEn(a.startsAt),
    });
    expect(propia.find((o) => o.id === a.id)?.enSuLista).toBe(true);
  });

  it("agendada, la clase la incluye en su lista para pasar asistencia (y no dos veces)", async () => {
    const b = await proximaDe(salonB);
    await agendar("REGULAR", b.id);
    const { lista } = await listaDeSesion(b.id);
    expect(lista.find((f) => f.childPersonId === ninoId)?.agendado).toBe(true);
    await expect(agendar("REGULAR", b.id)).rejects.toBeInstanceOf(ConflictError);
    const { agendados } = await agendaDeNino(ninoId, null);
    expect(agendados.some((x) => x.tipo === "REGULAR" && x.vigente)).toBe(true);
  });

  it("evento ABIERTO con su alcance sí; cerrado o de otro curso, no", async () => {
    const fecha = diaEn(new Date(Date.now() + 9 * 86_400_000));
    const abierto = await nuevoEvento({ salon: salonC, fecha, hora: "10:00" });
    const cerrado = await nuevoEvento({ salon: salonC, fecha, hora: "11:00", abierto: false });
    const otroCurso = await nuevoEvento({
      salon: salonC,
      fecha,
      hora: "12:00",
      curso: "YOUNGSTER",
    });
    const ids = (
      await opcionesAgendaNino({ childPersonId: ninoId, countryScope: null, tipo: "CLUB", fecha })
    ).map((o) => o.id);
    expect(ids).toContain(abierto);
    expect(ids).not.toContain(cerrado);
    expect(ids).not.toContain(otroCurso);
  });

  it("el PAÍS y el NIVEL del evento abierto también deciden (null = todos)", async () => {
    const fecha = diaEn(new Date(Date.now() + 11 * 86_400_000));
    const suPais = await nuevoEvento({ salon: salonC, fecha, hora: "13:00", pais: "CO" });
    const otroPais = await nuevoEvento({ salon: salonC, fecha, hora: "14:00", pais: "CL" });
    const suNivel = await nuevoEvento({ salon: salonC, fecha, hora: "15:00", nivel: "ROOKIE" });
    const otroNivel = await nuevoEvento({ salon: salonC, fecha, hora: "16:00", nivel: "ELITE" });
    const ids = (
      await opcionesAgendaNino({ childPersonId: ninoId, countryScope: null, tipo: "CLUB", fecha })
    ).map((o) => o.id);
    expect(ids).toContain(suPais);
    expect(ids).not.toContain(otroPais);
    expect(ids).toContain(suNivel);
    expect(ids).not.toContain(otroNivel);
    await expect(agendar("CLUB", otroPais)).rejects.toBeInstanceOf(ConflictError);
  });

  it("Inscripción Clubes: el niño ve los de ESTA semana, se inscribe y se borra", async () => {
    // Un club dentro de unos minutos (esta semana, salvo el domingo a medianoche)
    // y otro dentro de ocho días (la semana que viene).
    const pronto = new Date(Date.now() + 20 * 60_000);
    const pared = new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONA,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(pronto);
    const esteClub = await nuevoEvento({
      salon: salonC,
      fecha: diaEn(pronto),
      hora: pared,
      duracionMin: 15,
    });
    const otraSemana = await nuevoEvento({
      salon: salonC,
      fecha: diaEn(new Date(Date.now() + 8 * 86_400_000)),
      hora: "07:00",
    });
    const lunes = (d: Date) => {
      const f = new Date(`${diaEn(d)}T00:00:00Z`);
      f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 6) % 7));
      return f.toISOString().slice(0, 10);
    };
    const mismaSemana = lunes(pronto) === lunes(new Date());

    const lista = await clubesPropios(ninoId);
    expect(lista.some((c) => c.id === otraSemana)).toBe(false);
    const club = lista.find((c) => c.id === esteClub);
    if (!mismaSemana) {
      expect(club).toBeUndefined();
      return;
    }
    expect(club?.enSuLista).toBe(false);
    if (club?.choque !== null) return; // justo a la hora de su clase: no se inscribe
    await inscribirClubPropio({ userId: actor, childPersonId: ninoId, sessionId: esteClub });
    const inscrito = (await clubesPropios(ninoId)).find((c) => c.id === esteClub);
    expect(inscrito?.agendadoId).not.toBeNull();
    expect(inscrito?.propia).toBe(false);
    expect((await listaDeSesion(esteClub)).lista.some((f) => f.childPersonId === ninoId)).toBe(
      true,
    );
    // Solo se borra de un CLUB: lo agendado de otro tipo no lo toca el niño.
    await cancelarClubPropio({
      userId: actor,
      childPersonId: ninoId,
      agendadoId: inscrito?.agendadoId ?? "",
    });
    expect((await clubesPropios(ninoId)).find((c) => c.id === esteClub)?.agendadoId).toBeNull();
  });

  it("el niño no puede borrar con Inscripción Clubes algo que no es un club", async () => {
    const { agendados } = await agendaDeNino(ninoId, null);
    const regular = agendados.find((x) => x.tipo === "REGULAR");
    expect(regular).toBeDefined();
    await expect(
      cancelarClubPropio({ userId: actor, childPersonId: ninoId, agendadoId: regular?.id ?? "" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lo que choca con su clase se muestra marcado y no se deja agendar", async () => {
    const a = await proximaDe(salonA);
    const fecha = diaEn(a.startsAt);
    const choca = await nuevoEvento({ salon: salonC, fecha, hora: "17:30", tipo: "TALLER" });
    const op = await opcionesAgendaNino({
      childPersonId: ninoId,
      countryScope: null,
      tipo: "TALLER",
      fecha,
    });
    expect(op.find((o) => o.id === choca)?.choque).toContain("su salón");
    await expect(agendar("TALLER", choca)).rejects.toBeInstanceOf(ConflictError);
  });

  it("lleno: 409 de sobrecupo; autorizarlo exige el permiso; con él, entra", async () => {
    const fecha = diaEn(new Date(Date.now() + 10 * 86_400_000));
    const lleno = await nuevoEvento({
      salon: salonB,
      fecha,
      hora: "09:00",
      limite: 1,
      tipo: "SESION",
    });
    // Alguien ya ocupa el único lugar (el salón B no tiene matriculados).
    const s = await queryOne<{ startsAt: Date }>(
      `SELECT starts_at AS "startsAt" FROM scheduling_session WHERE id = $1`,
      [lleno],
    );
    await execute(
      `INSERT INTO scheduling_agendado (id, classroom_id, starts_at, child_person_id, tipo, agendado_por)
       VALUES ($1, $2, $3, $4, 'SESION', $5)`,
      [newId(), salonB, s?.startsAt, apoderadoId, actor],
    );
    const op = await opcionesAgendaNino({
      childPersonId: ninoId,
      countryScope: null,
      tipo: "SESION",
      fecha,
    });
    expect(op.find((o) => o.id === lleno)?.lleno).toBe(true);

    const sinAutorizar = await agendar("SESION", lleno).catch((e: unknown) => e);
    expect(sinAutorizar).toBeInstanceOf(ConflictError);
    expect((sinAutorizar as AppError).details).toMatchObject({ tipo: "sobrecupo", limite: 1 });
    await expect(agendar("SESION", lleno, { autorizarSobrecupo: true })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const ok = await agendar("SESION", lleno, { autorizarSobrecupo: true, puedeSobrecupo: true });
    expect(ok.sobrecupo).toBe(true);
  });

  it("mover el evento muda a los agendados; cancelar lo saca de la lista", async () => {
    const fecha = diaEn(new Date(Date.now() + 12 * 86_400_000));
    const ev = await nuevoEvento({ salon: salonC, fecha, hora: "08:00" });
    await agendar("CLUB", ev);
    await editarEvento({
      actorUserId: actor,
      sessionId: ev,
      tipo: "CLUB",
      fecha,
      horaLocal: "08:30",
      duracionMin: 60,
      guiaUserId: actor,
    });
    const { lista } = await listaDeSesion(ev);
    expect(lista.some((f) => f.childPersonId === ninoId)).toBe(true);

    const { agendados } = await agendaDeNino(ninoId, null);
    const delClub = agendados.find((x) => x.tipo === "CLUB");
    await cancelarAgendadoNino({
      actorUserId: actor,
      childPersonId: ninoId,
      countryScope: null,
      agendadoId: delClub?.id ?? "",
    });
    const despues = await listaDeSesion(ev);
    expect(despues.lista.some((f) => f.childPersonId === ninoId)).toBe(false);
  });
});
