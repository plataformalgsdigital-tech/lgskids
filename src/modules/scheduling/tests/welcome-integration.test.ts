import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne, queryRows } from "@/platform/db/query";
import { withTransaction } from "@/platform/db/transaction";
import { ConflictError, ValidationError } from "@/platform/errors";
import { colisionesDeCampania } from "../application/colisiones";
import {
  crearEvento,
  crearEventoAdmin,
  detalleEventoAdmin,
  editarEvento,
  editarEventoAdmin,
  marcarAsistenciaEventoAdmin,
  salonesDelAlcance,
} from "../application/crear-evento";
import { crearSalon } from "../application/gestion-salones";
import {
  agendadosWelcome,
  candidatosVideoWelcome,
  enviarVideosWelcome,
  guardarVideoWelcome,
  reagendamientosWelcome,
  videoWelcome,
} from "../application/servicio-welcome";
import { setSenderForTests, type MensajeSaliente } from "@/modules/notifications";
import {
  crearWelcome,
  detalleWelcome,
  editarWelcome,
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
    await execute(
      `DELETE FROM people_guardianship WHERE nino_id = ANY($1) OR apoderado_id = ANY($1)`,
      [ninos],
    );
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

  it("el Welcome para curso EN MARCHA puede ser después del inicio del curso", async () => {
    // Sin la marca, después del inicio se rechaza (primera prueba); con ella, no.
    const enMarcha = await nuevo({ fecha: dias(40), enMarcha: true });
    const lista = await welcomesDisponibles({ classroomId: junior, nivel: "ROOKIE" });
    expect(lista.find((w) => w.id === enMarcha)?.enMarcha).toBe(true);
    // Y el niño lo puede agendar con la misma reserva de siempre.
    const [, , c] = ninos as [string, string, string];
    await reservar(enMarcha, c, junior);
    expect((await welcomeDeNino(c))?.welcomeId).toBe(enMarcha);
  });

  it("colisiones: el mismo guía con dos salones a la misma hora", async () => {
    const curso = (
      await queryOne<{ id: string }>(
        `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
        [campaniaId],
      )
    )?.id as string;
    const choque = async (nombre: string) =>
      (
        await crearSalon({
          actorUserId: actor,
          courseId: curso,
          nombre,
          guiaUserId: actor,
          cupo: 5,
          timezone: "America/Santiago",
          holidayCountry: "CL",
          slots: [{ tipo: "SESION", diaSemana: 4, horaLocal: "18:00", duracionMin: 60 }],
        })
      ).id;
    const a = await choque(`Choque A ${marca}`);
    const b = await choque(`Choque B ${marca}`);
    try {
      const lista = await colisionesDeCampania(campaniaId);
      const c = lista.find(
        (x) =>
          [x.salonA, x.salonB].includes(`Choque A ${marca}`) &&
          [x.salonA, x.salonB].includes(`Choque B ${marca}`),
      );
      expect(c?.mismoCurso).toBe(true);
      expect(c?.choques).toBeGreaterThan(0);
    } finally {
      for (const cl of [a, b]) {
        await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [cl]);
        await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [cl]);
        await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [cl]);
      }
    }
  });

  it("EDITAR un Welcome con niños agendados los conserva, y el límite no baja de ellos", async () => {
    const id = await nuevo({ fecha: dias(13), limiteUsuarios: 3 });
    const [a, b] = ninos as [string, string];
    await reservar(id, a, junior);
    await reservar(id, b, junior);
    const base = {
      actorUserId: actor,
      id,
      fecha: dias(14),
      horaLocal: "10:30",
      zona: "America/Santiago",
      duracionMin: 45,
      guiaUserId: actor,
      campaignId: campaniaId,
      pais: null,
      curso: null,
      classroomId: null,
      nivel: "ROOKIE",
      observaciones: "Movido",
    } as const;
    await expect(editarWelcome({ ...base, limiteUsuarios: 1 })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await editarWelcome({ ...base, limiteUsuarios: 2 });
    const { welcome, inscritos } = await detalleWelcome(id);
    expect(welcome.duracionMin).toBe(45);
    expect(welcome.limiteUsuarios).toBe(2);
    expect(inscritos.map((i) => i.childPersonId).sort()).toEqual([a, b].sort());
    // Sigue siendo la MISMA regla del alta: no puede quedar después del inicio.
    await expect(
      editarWelcome({ ...base, fecha: dias(40), limiteUsuarios: 2 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("EDITAR un evento suelto compartido mueve todos sus salones; cerrado ya no se edita", async () => {
    const creado = await crearEvento({
      actorUserId: actor,
      classroomIds: [junior, youngster],
      tipo: "CLUB",
      fecha: dias(5),
      horaLocal: "11:00",
      duracionMin: 60,
      guiaUserId: actor,
    });
    const [primera] = creado.sesiones;
    const r = await editarEvento({
      actorUserId: actor,
      sessionId: primera?.id as string,
      tipo: "TALLER",
      fecha: dias(6),
      horaLocal: "12:00",
      duracionMin: 120,
      guiaUserId: actor,
      observaciones: "Taller movido",
    });
    expect(r.sesiones).toBe(2);
    const filas = await queryRows<{ tipo: string; fecha: string; duracionMin: number }>(
      `SELECT tipo::text, fecha::text, duracion_min AS "duracionMin"
         FROM scheduling_session WHERE id = ANY($1)`,
      [creado.sesiones.map((s) => s.id)],
    );
    expect(filas).toHaveLength(2);
    for (const f of filas) {
      expect(f).toEqual({ tipo: "TALLER", fecha: dias(6), duracionMin: 120 });
    }

    await execute(`UPDATE scheduling_session SET cerrada_en = now() WHERE id = $1`, [primera?.id]);
    await expect(
      editarEvento({
        actorUserId: actor,
        sessionId: creado.sesiones[1]?.id as string,
        tipo: "CLUB",
        fecha: dias(7),
        horaLocal: "12:00",
        duracionMin: 60,
        guiaUserId: actor,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('salón "Todos": UNA clase en todos los salones del alcance, en UN instante', async () => {
    const delAlcance = await salonesDelAlcance({ campaignId: campaniaId, pais: null, curso: null });
    expect(delAlcance.sort()).toEqual([junior, youngster].sort());
    expect(await salonesDelAlcance({ campaignId: campaniaId, pais: "CO", curso: null })).toEqual([
      youngster,
    ]);

    // Chile y Colombia: la hora va en el reloj de quien la escribe.
    const creado = await crearEvento({
      actorUserId: actor,
      classroomIds: delAlcance,
      todos: true,
      zona: "America/Bogota",
      tipo: "CLUB",
      fecha: dias(9),
      horaLocal: "13:00",
      duracionMin: 60,
      guiaUserId: actor,
    });
    expect(creado.grupoId).not.toBeNull();
    const filas = await queryRows<{ startsAt: Date }>(
      `SELECT starts_at AS "startsAt" FROM scheduling_session WHERE id = ANY($1)`,
      [creado.sesiones.map((s) => s.id)],
    );
    expect(filas).toHaveLength(2);
    expect(new Set(filas.map((f) => f.startsAt.toISOString())).size).toBe(1);

    // Si un salón ya tiene algo a esa hora, no se crea en ninguno y se dice cuál.
    await expect(
      crearEvento({
        actorUserId: actor,
        classroomIds: delAlcance,
        todos: true,
        zona: "America/Bogota",
        tipo: "TALLER",
        fecha: dias(9),
        horaLocal: "13:00",
        duracionMin: 60,
        guiaUserId: actor,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('Welcome de nivel "Todos" le sirve a un niño de cualquier nivel', async () => {
    const id = await nuevo({ nivel: null, horaLocal: "08:00" });
    for (const nivel of ["ROOKIE", "CHAMPION", "ULTIMATE"]) {
      const lista = await welcomesDisponibles({ classroomId: junior, nivel });
      expect(lista.map((w) => w.id)).toContain(id);
    }
  });

  it("una clase del HORARIO no se edita como evento", async () => {
    const regular = await queryOne<{ id: string }>(
      `SELECT id FROM scheduling_session WHERE classroom_id = $1 AND slot_id IS NOT NULL LIMIT 1`,
      [junior],
    );
    await expect(
      editarEvento({
        actorUserId: actor,
        sessionId: regular?.id as string,
        tipo: "SESION",
        fecha: dias(8),
        horaLocal: "12:00",
        duracionMin: 60,
        guiaUserId: actor,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("EDITAR un evento administrativo cambia la audiencia y conserva la asistencia de quien sigue", async () => {
    const otro = (
      await queryOne<{ id: string }>(
        `SELECT id FROM identity_user WHERE estado = 'ACTIVO' AND id <> $1 LIMIT 1`,
        [actor],
      )
    )?.id as string;
    const datos = {
      actorUserId: actor,
      tipo: "MEETING",
      titulo: `Reunión ${marca}`,
      fecha: dias(4),
      horaLocal: "09:00",
      duracionMin: 60,
      zona: "America/Bogota",
      guiaUserIds: [actor, otro],
    } as const;
    const { id } = await crearEventoAdmin({ ...datos, guiaUserIds: [...datos.guiaUserIds] });
    try {
      await marcarAsistenciaEventoAdmin({
        actorUserId: actor,
        eventoId: id,
        marcas: [{ guiaUserId: actor, asistio: true }],
      });
      const r = await editarEventoAdmin({
        ...datos,
        id,
        tipo: "TRAINING",
        duracionMin: 120,
        guiaUserIds: [actor],
      });
      expect(r.guias).toBe(1);
      const det = await detalleEventoAdmin(id);
      expect(det.tipo).toBe("TRAINING");
      expect(det.guiaUserIds).toEqual([actor]);
      const asis = await queryOne<{ asistio: boolean | null }>(
        `SELECT asistio FROM scheduling_evento_admin_guia WHERE evento_id = $1 AND guia_user_id = $2`,
        [id, actor],
      );
      expect(asis?.asistio).toBe(true);
    } finally {
      await execute(`DELETE FROM scheduling_evento_admin WHERE id = $1`, [id]);
    }
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

  // Prueba aparte (usa lo que dejó la anterior: `c` agendado y presente el día 12):
  // juntas pasaban de los 5 s por defecto en CI con las pruebas en paralelo.
  it(
    "Servicio › Welcome lo lista con su asistencia y filtra por ella",
    { timeout: 20_000 },
    async () => {
      const [, , c] = ninos as [string, string, string];
      const base = {
        countryScope: null,
        desde: dias(12),
        hasta: dias(12),
        zona: "America/Bogota",
        buscar: `welcome${marca}`,
      };
      const todos = await agendadosWelcome(base);
      expect(todos.find((a) => a.childPersonId === c)?.estado).toBe("ASISTIO");
      expect(
        (await agendadosWelcome({ ...base, estado: "ASISTIO" })).map((a) => a.childPersonId),
      ).toContain(c);
      expect(
        (await agendadosWelcome({ ...base, estado: "NO_ASISTIO" })).map((a) => a.childPersonId),
      ).not.toContain(c);
      // El niño es de Chile: quien solo ve Colombia no lo ve.
      expect(await agendadosWelcome({ ...base, countryScope: ["CO"] })).toHaveLength(0);
    },
  );

  it(
    "como MOSAICO: el Welcome perdido no se borra, se reagenda, tope de 2 y luego el video",
    { timeout: 30_000 },
    async () => {
      // Un niño con apoderado (el video va al apoderado).
      const d = randomUUID();
      const apoderado = randomUUID();
      await execute(
        `INSERT INTO people_person (id, nombres, apellidos, doc_tipo, doc_numero, country_code, updated_at)
         VALUES ($1, 'Niño', $2, 'TI', $3, 'CL', now()),
                ($4, 'Mamá', $2, 'CC', $5, 'CL', now())`,
        [d, `Welcome${marca}`, `W${marca}-4`, apoderado, `W${marca}-A`],
      );
      await execute(`UPDATE people_person SET telefono = '912345678' WHERE id = $1`, [apoderado]);
      await execute(
        `INSERT INTO people_guardianship (id, nino_id, apoderado_id, parentesco)
         VALUES ($1, $2, $3, 'MADRE')`,
        [randomUUID(), d, apoderado],
      );
      ninos.push(d, apoderado);
      const pasar = (welcomeId: string) =>
        execute(
          `UPDATE scheduling_welcome SET starts_at = now() - interval '2 days',
                  fecha = (now() - interval '2 days')::date WHERE id = $1`,
          [welcomeId],
        );
      const base = { countryScope: null, zona: "America/Santiago", buscar: `W${marca}-4` };

      // Faltó al primero: sale en Reagendamientos, sin reagendar.
      const w1 = await nuevo({ fecha: dias(16) });
      await reservar(w1, d, junior);
      await pasar(w1);
      let faltas = await reagendamientosWelcome(base);
      expect(faltas.map((x) => x.welcomeId)).toEqual([w1]);
      expect(faltas[0]?.reagendadoA).toBeNull();
      expect((await agendadosWelcome(base))[0]?.estado).toBe("NO_ASISTIO");

      // Se le reagenda: la reserva perdida NO se borra (REAGENDADA) y el nuevo se ve.
      const w2 = await nuevo({ fecha: dias(17) });
      await reservar(w2, d, junior);
      expect((await detalleWelcome(w1)).inscritos.map((i) => i.childPersonId)).toContain(d);
      faltas = await reagendamientosWelcome(base);
      expect(faltas[0]?.reagendadoA).not.toBeNull();
      expect(await reagendamientosWelcome({ ...base, soloSinReagendar: true })).toHaveLength(0);

      // Faltó también al segundo: el tope de 2 no deja un tercero; toca el video.
      await pasar(w2);
      const w3 = await nuevo({ fecha: dias(18) });
      await expect(reservar(w3, d, junior)).rejects.toBeInstanceOf(ConflictError);
      const candidatos = await candidatosVideoWelcome(base);
      expect(candidatos.map((x) => x.childPersonId)).toEqual([d]);
      expect(candidatos[0]?.perdidos).toBe(2);

      // Sin enlace configurado no se envía; con enlace, sale al apoderado.
      const enviados: MensajeSaliente[] = [];
      setSenderForTests({
        enviar: (m) => {
          enviados.push(m);
          return Promise.resolve({ ok: true });
        },
      });
      const previo = await videoWelcome();
      try {
        await guardarVideoWelcome({ actorUserId: actor, enlace: "https://youtu.be/bienvenida" });
        const [r] = await enviarVideosWelcome({
          actorUserId: actor,
          childPersonIds: [d],
          countryScope: null,
        });
        expect(r?.ok).toBe(true);
        expect(enviados.at(-1)?.destinatario).toBe("56912345678");
        expect(enviados.at(-1)?.mensaje).toContain("https://youtu.be/bienvenida");
        // Cuenta como Welcome hecho: sale de Reagendamientos y queda "VIDEO".
        expect(await reagendamientosWelcome(base)).toHaveLength(0);
        expect((await agendadosWelcome(base)).every((a) => a.estado === "VIDEO")).toBe(true);
        expect((await candidatosVideoWelcome(base))[0]?.envios).toBe(1);
      } finally {
        setSenderForTests(null);
        await execute(`DELETE FROM notifications_outbox WHERE child_person_id = $1`, [d]);
        if (previo.enlace !== null) {
          await guardarVideoWelcome({ actorUserId: actor, enlace: previo.enlace });
        } else {
          await execute(`DELETE FROM platform_config WHERE clave = 'welcome_video_url'`, []);
        }
      }
    },
  );
});
