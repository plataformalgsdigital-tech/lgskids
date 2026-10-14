import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCampania } from "@/modules/catalog";
import { aprobarContrato, crearContrato } from "@/modules/contracts";
import { crearNino } from "@/modules/people";
import { crearSalon } from "@/modules/scheduling";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { AppError, ConflictError, ForbiddenError, ValidationError } from "@/platform/errors";
import {
  agregarContacto,
  agregarNota,
  asignarCaso,
  bandejaCasos,
  casosDeNino,
  cerrarCaso,
  detalleCaso,
  exigirReporteDesdeSesion,
  reportarCaso,
  reportesDeSesion,
} from "../application/casos";

/**
 * CASOS DE ATENCIÓN (2026-10-14), de punta a punta: el guía reporta desde su
 * sesión, el reporte abre el caso o se suma, Servicio lo asigna, el área
 * contacta a la familia y lo cierra con acuerdo y conclusión.
 *
 * Los actores son cuentas reales: `abierto_por`, `registrado_por` y `autor` son
 * claves foráneas.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const marca = randomUUID().slice(0, 6);
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe.runIf(RUN)("casos de atención (integración)", () => {
  let guia: string;
  let otro: string;
  let campaniaId: string;
  let salon: string;
  let sessionId: string;
  let nino: string;
  let contractId: string;
  let casoId: string;
  const ZONA = "America/Bogota";

  beforeAll(async () => {
    guia = (
      await queryOne<{ id: string }>(`SELECT id FROM identity_user WHERE username = 'sistema-lgs'`)
    )?.id as string;
    otro = (
      await queryOne<{ id: string }>(
        `SELECT id FROM identity_user WHERE estado = 'ACTIVO' AND id <> $1 ORDER BY created_at LIMIT 1`,
        [guia],
      )
    )?.id as string;
    campaniaId = (
      await crearCampania({
        actorUserId: guia,
        nombre: `Casos ${marca}`,
        inicio: dias(-30),
        cursoInicio: dias(-20),
      })
    ).id;
    const curso = await queryOne<{ id: string }>(
      `SELECT id FROM catalog_course WHERE campaign_id = $1 AND tipo = 'JUNIOR'`,
      [campaniaId],
    );
    salon = (
      await crearSalon({
        actorUserId: guia,
        courseId: curso?.id ?? "",
        nombre: `Casos Jr ${marca}`,
        guiaUserId: guia,
        cupo: 5,
        timezone: ZONA,
        holidayCountry: "CO",
        slots: [{ tipo: "SESION", diaSemana: 2, horaLocal: "17:00", duracionMin: 60 }],
      })
    ).id;
    sessionId = (
      await queryOne<{ id: string }>(
        `SELECT id FROM scheduling_session WHERE classroom_id = $1 ORDER BY starts_at LIMIT 1`,
        [salon],
      )
    )?.id as string;
    const creado = await crearNino({
      actorUserId: guia,
      nino: {
        nombres: "Caso",
        apellidos: `Prueba${marca}`,
        fechaNacimiento: `${String(new Date().getUTCFullYear() - 8)}-03-10`,
        docTipo: "TI",
        docNumero: `CS-${marca}`,
        countryCode: "CO",
      },
      apoderadoNuevo: {
        nombres: "Mamá",
        apellidos: `Prueba${marca}`,
        docTipo: "CC",
        docNumero: `CS-${marca}-A`,
        countryCode: "CO",
      },
    });
    nino = creado.ninoId;
    contractId = await crearContrato({
      actorUserId: guia,
      titularId: creado.apoderadoId,
      beneficiarioId: nino,
      countryCode: "CO",
      tipoCurso: "JUNIOR",
      inicio: dias(-20),
    });
    await aprobarContrato({
      actorUserId: guia,
      contractId,
      classroomId: salon,
      enviarPerfil: false,
    });
  });

  afterAll(async () => {
    await execute(`DELETE FROM casos_caso WHERE child_person_id = $1`, [nino]);
    await execute(`DELETE FROM enrollment_enrollment WHERE classroom_id = $1`, [salon]);
    const user = await queryOne<{ id: string | null }>(
      `SELECT user_id AS id FROM people_person WHERE id = $1`,
      [nino],
    );
    await execute(`DELETE FROM contracts_contract WHERE id = $1`, [contractId]);
    await execute(`DELETE FROM people_person WHERE apellidos = $1`, [`Prueba${marca}`]);
    if (user?.id != null) await execute(`DELETE FROM identity_user WHERE id = $1`, [user.id]);
    await execute(`DELETE FROM scheduling_session WHERE classroom_id = $1`, [salon]);
    await execute(`DELETE FROM scheduling_slot WHERE classroom_id = $1`, [salon]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [salon]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaniaId]);
    await closePool();
  });

  it("el guía solo reporta desde SU sesión y sobre un niño de esa lista", async () => {
    await expect(
      exigirReporteDesdeSesion({
        actorUserId: otro,
        sessionId,
        childPersonId: nino,
        puedeGestionarSalones: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      exigirReporteDesdeSesion({
        actorUserId: guia,
        sessionId,
        childPersonId: randomUUID(),
        puedeGestionarSalones: false,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const ok = await exigirReporteDesdeSesion({
      actorUserId: guia,
      sessionId,
      childPersonId: nino,
      puedeGestionarSalones: false,
    });
    expect(ok.guiaUserId).toBe(guia);
  });

  it("el primer reporte ABRE el caso, con código por contrato", async () => {
    const r = await reportarCaso({
      actorUserId: guia,
      childPersonId: nino,
      texto: "No prende la cámara y llora",
      tema: "CONDUCTA",
      origen: "GUIA",
      sessionId,
      guiaUserId: guia,
      countryScope: null,
    });
    expect(r.abrioCaso).toBe(true);
    expect(r.codigo).toMatch(/^CA-K\d+-01$/);
    casoId = r.casoId;
    expect((await reportesDeSesion(sessionId)).map((x) => x.childPersonId)).toContain(nino);
  });

  it("con un caso abierto hay que elegir: sin destino 409 con los casos; sumar o abrir otro tema", async () => {
    const base = {
      actorUserId: guia,
      childPersonId: nino,
      texto: "Otra vez sin cámara",
      origen: "GUIA" as const,
      sessionId,
      guiaUserId: guia,
      countryScope: null,
    };
    try {
      await reportarCaso({ ...base, tema: "CONDUCTA" });
      expect.unreachable("debía pedir destino");
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError);
      expect((e as AppError).details).toMatchObject({ tipo: "caso_abierto" });
    }
    const sumado = await reportarCaso({ ...base, tema: "CONDUCTA", destino: casoId });
    expect(sumado).toMatchObject({ casoId, abrioCaso: false });
    // Un caso abierto por tema: NUEVO del mismo tema se rechaza; de otro, abre el -02.
    await expect(
      reportarCaso({ ...base, tema: "CONDUCTA", destino: "NUEVO" }),
    ).rejects.toBeInstanceOf(ConflictError);
    const otroTema = await reportarCaso({
      ...base,
      tema: "SALUD",
      texto: "Dice que le duele la cabeza",
      destino: "NUEVO",
    });
    expect(otroTema.codigo).toMatch(/-02$/);
  });

  it("Servicio lo asigna a un área: sale de 'sin asignar' y entra a la del área", async () => {
    await asignarCaso({
      actorUserId: otro,
      casoId,
      area: "ACADEMICO",
      comentario: "Llamar a la mamá",
      countryScope: null,
    });
    const filtros = { countryScope: null, zona: ZONA, buscar: `Prueba${marca}` };
    const sinAsignar = await bandejaCasos({ ...filtros, vista: "SIN_ASIGNAR" });
    const academico = await bandejaCasos({ ...filtros, vista: "ACADEMICO" });
    expect(sinAsignar.casos.map((c) => c.id)).not.toContain(casoId);
    expect(academico.casos.find((c) => c.id === casoId)?.estado).toBe("REMITIDO_ACADEMICO");
    expect(academico.conteos.ACADEMICO).toBeGreaterThanOrEqual(1);
    // Alcance por país del niño.
    expect(
      (await bandejaCasos({ ...filtros, vista: "ACADEMICO", countryScope: ["CL"] })).casos,
    ).toHaveLength(0);
  });

  it("asignado, se registran contactos (MOSAICO los rechazaba) numerados por canal", async () => {
    const a = await agregarContacto({
      actorUserId: otro,
      casoId,
      canal: "LLAMADA",
      resultado: "NO_CONTESTO",
      countryScope: null,
    });
    const b = await agregarContacto({
      actorUserId: otro,
      casoId,
      canal: "LLAMADA",
      resultado: "CONTESTO",
      countryScope: null,
    });
    const w = await agregarContacto({
      actorUserId: otro,
      casoId,
      canal: "WHATSAPP",
      resultado: "RESPONDIO",
      countryScope: null,
    });
    expect([a.intento, b.intento, w.intento]).toEqual([1, 2, 1]);
    await agregarNota({
      actorUserId: otro,
      casoId,
      texto: "La mamá dice que es la conexión",
      countryScope: null,
    });
  });

  it("cerrar exige un cierre del área y el acuerdo; cerrado, es de solo lectura", async () => {
    await expect(
      cerrarCaso({
        actorUserId: otro,
        casoId,
        estado: "CURSO_CAMBIADO",
        conclusion: "Se cambió",
        acuerdo: "x",
        countryScope: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      cerrarCaso({
        actorUserId: otro,
        casoId,
        estado: "RESUELTO",
        conclusion: "Se resolvió la cámara",
        countryScope: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await cerrarCaso({
      actorUserId: otro,
      casoId,
      estado: "RESUELTO",
      conclusion: "Se resolvió la cámara",
      acuerdo: "Conectarse desde el computador",
      noContinua: true,
      countryScope: null,
    });
    await expect(
      agregarNota({ actorUserId: otro, casoId, texto: "tarde", countryScope: null }),
    ).rejects.toBeInstanceOf(ConflictError);
    const historico = await bandejaCasos({
      countryScope: null,
      zona: ZONA,
      vista: "HISTORICO",
      buscar: `Prueba${marca}`,
    });
    const fila = historico.casos.find((c) => c.id === casoId);
    expect(fila?.noContinua).toBe(true);
    expect(fila?.ultimoMovimiento).toContain("Se resolvió la cámara");
  });

  it("el detalle marca los reportes como leídos y arma el seguimiento completo", async () => {
    const d = await detalleCaso(casoId, { actorUserId: otro, countryScope: null });
    expect(d.reportes).toBe(2);
    expect(d.sinLeer).toBe(0);
    const tipos = new Set(d.seguimiento.map((e) => e.tipo));
    expect([...tipos].sort()).toEqual(["CONTACTO", "ESTADO", "NOTA", "REPORTE"]);
    expect(d.contactos).toHaveLength(3);
    expect(d.otros).toHaveLength(1);
    // En la ficha: los dos casos, abiertos primero.
    const ficha = await casosDeNino(nino, null);
    expect(ficha.map((c) => c.cerradoEn === null)).toEqual([true, false]);
  });
});
