import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listaDeSesion, marcarAsistencia } from "@/modules/attendance";
import { crearCampania } from "@/modules/catalog";
import { crearNino } from "@/modules/people";
import {
  crearEvento,
  crearSalon,
  editarEvento,
  eliminarEvento,
  suspenderEvento,
  retirarClubesPorFaltas,
} from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/platform/errors";
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
    tanda?: { inicio: string; fin: string };
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
      tanda: o.tanda ?? null,
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
    eventos.push(...r.sesiones.map((s) => s.id));
    return id;
  };

  const sumarDiasA = (fecha: string, dias: number) => {
    const d = new Date(`${fecha}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };

  /** Inscripción del niño en la tanda de una sesión (la última, sea cual sea su estado). */
  const inscripcionDe = (sessionId: string) =>
    queryOne<{ id: string; estado: string; finMotivo: string | null }>(
      `SELECT i.id, i.estado, i.fin_motivo AS "finMotivo"
         FROM scheduling_club_inscripcion i
         JOIN scheduling_session s ON s.tanda_id = i.tanda_id
        WHERE s.id = $1 AND i.child_person_id = $2
        ORDER BY i.inscrito_en DESC LIMIT 1`,
      [sessionId, ninoId],
    );

  /** Las semanas de una tanda en las que el niño está en la lista. */
  const semanasEnLista = async (sessionId: string) =>
    (
      await queryOne<{ n: number }>(
        `SELECT count(*)::int AS n FROM scheduling_agendado g
           JOIN scheduling_session s ON s.classroom_id = g.classroom_id AND s.starts_at = g.starts_at
          WHERE g.child_person_id = $2 AND g.estado = 'ACTIVA'
            AND s.tanda_id = (SELECT tanda_id FROM scheduling_session WHERE id = $1)`,
        [sessionId, ninoId],
      )
    )?.n ?? 0;

  /**
   * Lleva al pasado las primeras `n` semanas de una tanda (sesión y agendados a
   * la vez: el agendado va atado a salón + instante) para poder "pasarles lista".
   */
  const alPasado = async (sessionId: string, n: number): Promise<string[]> => {
    const semanas = await queryRows<{ id: string; classroomId: string; startsAt: Date }>(
      `SELECT s.id, s.classroom_id AS "classroomId", s.starts_at AS "startsAt"
         FROM scheduling_session s
        WHERE s.tanda_id = (SELECT tanda_id FROM scheduling_session WHERE id = $1)
        ORDER BY s.starts_at LIMIT $2`,
      [sessionId, n],
    );
    for (const [i, s] of semanas.entries()) {
      const nuevo = new Date(Date.now() - (n - i) * 86_400_000);
      await execute(
        `UPDATE scheduling_agendado SET starts_at = $3 WHERE classroom_id = $1 AND starts_at = $2`,
        [s.classroomId, s.startsAt, nuevo],
      );
      await execute(`UPDATE scheduling_session SET starts_at = $2 WHERE id = $1`, [s.id, nuevo]);
    }
    return semanas.map((s) => s.id);
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
    await execute(`DELETE FROM attendance_attendance WHERE child_person_id = $1`, [ninoId]);
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

  it("un CLUB de su salón es de inscritos: no está en la lista hasta que se inscribe", async () => {
    const fecha = diaEn(new Date(Date.now() + 13 * 86_400_000));
    const club = await nuevoEvento({ salon: salonA, fecha, hora: "07:30", abierto: false });
    expect((await listaDeSesion(club)).lista.some((f) => f.childPersonId === ninoId)).toBe(false);
    const op = await opcionesAgendaNino({
      childPersonId: ninoId,
      countryScope: null,
      tipo: "CLUB",
      fecha,
    });
    expect(op.find((o) => o.id === club)?.enSuLista).toBe(false);
    await agendar("CLUB", club);
    const lista = (await listaDeSesion(club)).lista;
    const fila = lista.find((f) => f.childPersonId === ninoId);
    // Inscrito de SU salón: está en la lista, pero no "viene de otro salón".
    expect(fila?.agendado).toBe(false);
    // Un club de su salón de OTRO nivel no le corresponde.
    const deOtroNivel = await nuevoEvento({
      salon: salonA,
      fecha,
      hora: "08:45",
      abierto: false,
      nivel: "ELITE",
    });
    await expect(agendar("CLUB", deOtroNivel)).rejects.toBeInstanceOf(ConflictError);
  });

  it("TANDA: inscribirse lo deja en todas las semanas; 2 faltas seguidas lo retiran", async () => {
    const inicio = diaEn(new Date(Date.now() + 2 * 86_400_000));
    const primera = await nuevoEvento({
      salon: salonC,
      fecha: inicio,
      hora: "06:30",
      tanda: { inicio, fin: sumarDiasA(inicio, 28) },
    });
    await agendar("CLUB", primera);
    // Todas las semanas de la tanda (sin contar las que un feriado del salón saltó).
    const semanas = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling_session
        WHERE tanda_id = (SELECT tanda_id FROM scheduling_session WHERE id = $1)`,
      [primera],
    );
    expect(semanas?.n).toBeGreaterThanOrEqual(3);
    expect(await semanasEnLista(primera)).toBe(semanas?.n);
    expect((await inscripcionDe(primera))?.estado).toBe("ACTIVA");

    // Pasan dos semanas y falta a las dos.
    const [s1, s2] = await alPasado(primera, 2);
    for (const s of [s1!, s2!]) {
      await marcarAsistencia({
        actorUserId: actor,
        sessionId: s,
        marcas: [{ childPersonId: ninoId, estado: "AUSENTE" }],
      });
    }
    const ins = await inscripcionDe(primera);
    expect(ins?.estado).toBe("RETIRADA");
    expect(ins?.finMotivo).toContain("faltas seguidas");
    // Las dos ya ocurridas quedan (historial); las 3 que faltan se liberan.
    expect(await semanasEnLista(primera)).toBe(2);
    expect((await listaDeSesion(s1!)).lista.some((f) => f.childPersonId === ninoId)).toBe(true);
  });

  it("una falta JUSTIFICADA corta la racha: no lo retira", async () => {
    const inicio = diaEn(new Date(Date.now() + 3 * 86_400_000));
    const primera = await nuevoEvento({
      salon: salonC,
      fecha: inicio,
      hora: "05:45",
      tanda: { inicio, fin: sumarDiasA(inicio, 21) },
    });
    await agendar("CLUB", primera);
    const [s1, s2] = await alPasado(primera, 2);
    await marcarAsistencia({
      actorUserId: actor,
      sessionId: s1!,
      marcas: [{ childPersonId: ninoId, estado: "AUSENTE" }],
    });
    await marcarAsistencia({
      actorUserId: actor,
      sessionId: s2!,
      marcas: [{ childPersonId: ninoId, estado: "JUSTIFICADO", justificacion: "Enfermo" }],
    });
    await retirarClubesPorFaltas([ninoId]);
    expect((await inscripcionDe(primera))?.estado).toBe("ACTIVA");
    // Salir por su cuenta libera las semanas que faltan, de una vez.
    const { agendados } = await agendaDeNino(ninoId, null);
    const proxima = agendados.find(
      (x) => x.tipo === "CLUB" && x.startsAt > new Date().toISOString(),
    );
    expect(proxima).toBeDefined();
  });

  it("SUSPENDER evento: sigue en el calendario, sin lista ni registro; se reactiva", async () => {
    const fecha = diaEn(new Date(Date.now() + 6 * 86_400_000));
    const ev = await nuevoEvento({ salon: salonC, fecha, hora: "04:45" });
    await agendar("CLUB", ev);
    await suspenderEvento({ actorUserId: actor, sessionId: ev, motivo: "Guía enfermo" });
    const s = await queryOne<{ motivo: string | null }>(
      `SELECT suspension_motivo AS motivo FROM scheduling_session WHERE id = $1`,
      [ev],
    );
    expect(s?.motivo).toBe("Guía enfermo");
    await expect(
      marcarAsistencia({
        actorUserId: actor,
        sessionId: ev,
        marcas: [{ childPersonId: ninoId, estado: "PRESENTE" }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Ya no se le ofrece para agendar: no se dicta.
    const op = await opcionesAgendaNino({
      childPersonId: ninoId,
      countryScope: null,
      tipo: "CLUB",
      fecha,
    });
    expect(op.some((o) => o.id === ev)).toBe(false);
    await suspenderEvento({ actorUserId: actor, sessionId: ev, motivo: null });
    await marcarAsistencia({
      actorUserId: actor,
      sessionId: ev,
      marcas: [{ childPersonId: ninoId, estado: "PRESENTE" }],
    });
    // Una clase del HORARIO no se suspende así.
    const regular = await proximaDe(salonA);
    await expect(
      suspenderEvento({ actorUserId: actor, sessionId: regular.id, motivo: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("CANCELAR evento: toda la tanda sale del calendario y cancela inscripciones", async () => {
    const inicio = diaEn(new Date(Date.now() + 4 * 86_400_000));
    const primera = await nuevoEvento({
      salon: salonC,
      fecha: inicio,
      hora: "05:15",
      tanda: { inicio, fin: sumarDiasA(inicio, 35) },
    });
    await agendar("CLUB", primera);
    const tanda = (
      await queryOne<{ t: string }>(`SELECT tanda_id AS t FROM scheduling_session WHERE id = $1`, [
        primera,
      ])
    )?.t;
    // Las semanas que la tanda tiene de verdad (los feriados del salón se saltan).
    const antes = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling_session WHERE tanda_id = $1`,
      [tanda],
    );
    expect(antes?.n).toBeGreaterThan(1);
    const r = await eliminarEvento({ actorUserId: actor, sessionId: primera, todaLaTanda: true });
    expect(r.sesiones).toBe(antes?.n);
    const quedan = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM scheduling_session WHERE tanda_id = $1`,
      [tanda],
    );
    expect(quedan?.n).toBe(0);
    const ins = await queryOne<{ estado: string }>(
      `SELECT estado FROM scheduling_club_inscripcion WHERE tanda_id = $1 AND child_person_id = $2`,
      [tanda, ninoId],
    );
    expect(ins?.estado).toBe("CANCELADA");
    // Una clase del HORARIO no se cancela: se suspende.
    const regular = await proximaDe(salonA);
    await expect(
      eliminarEvento({ actorUserId: actor, sessionId: regular.id }),
    ).rejects.toBeInstanceOf(ValidationError);
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

    // El de ESTE club: el niño ya tiene otros clubes inscritos de casos anteriores.
    const movido = await queryOne<{ startsAt: Date }>(
      `SELECT starts_at AS "startsAt" FROM scheduling_session WHERE id = $1`,
      [ev],
    );
    const { agendados } = await agendaDeNino(ninoId, null);
    const delClub = agendados.find(
      (x) => x.tipo === "CLUB" && x.startsAt === movido?.startsAt.toISOString(),
    );
    expect(delClub).toBeDefined();
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
