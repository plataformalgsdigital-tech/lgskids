import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { misAlumnos } from "@/modules/reporting";
import { env } from "@/platform/config/env";
import { closePool } from "@/platform/db/pool";
import { execute, queryOne } from "@/platform/db/query";
import { ForbiddenError, ValidationError } from "@/platform/errors";
import {
  autorizarEntregaExtra,
  datosLibroParaAlumno,
  exigirNinoDelGuia,
  libroDeNino,
  revisarProyecto,
  sincronizarLibroAlumno,
} from "../application/libro-alumno";
import { clavesLibro } from "../domain/proyectos-libro";

/**
 * INTEGRACIÓN: PROYECTOS DEL LIBRO CON REVISIÓN DEL GUÍA (2026-11-06).
 * El ciclo del contrato con diseño, del lado del servidor: el libro entrega →
 * se registra una sola vez → el guía pide cambios → reentrega → aprueba →
 * el libro recibe la revisión. Más lo que el servidor NO acepta del navegador.
 */
const RUN = env().INTEGRATION_TESTS === "1" && env().DATABASE_URL !== undefined;
const NIVEL = "LEGENDARY";
const K = clavesLibro(NIVEL);

describe.runIf(RUN)("proyectos del libro (integración)", () => {
  const marca = randomUUID().slice(0, 8);
  const guia = randomUUID();
  const otroGuia = randomUUID();
  const nino = randomUUID();
  const ninoUser = randomUUID();
  let campaignId = "";
  let salon = "";
  const doc = `LB-${marca}`;

  /** Lo que escribiría el libro: el historial COMPLETO de entregas. */
  const proyectos = (entregas: { id: string; unit: number; attempt: number; text?: string }[]) =>
    JSON.stringify({
      v: 1,
      course: "JUNIOR",
      level: "Legendary",
      student_id: doc,
      drafts: {},
      submissions: entregas.map((e) => ({
        submission_id: e.id,
        unit: e.unit,
        attempt: e.attempt,
        text: e.text ?? `Project unit ${String(e.unit)} v${String(e.attempt)}`,
        submitted_at: "2026-11-06T10:00:00.000Z",
      })),
    });
  const sincronizar = (datos: Record<string, string>) =>
    sincronizarLibroAlumno({ childPersonId: nino, curso: "JUNIOR", nivel: NIVEL, datos });
  const ultimaEntrega = async (unidad: number) =>
    (
      await queryOne<{ id: string }>(
        `SELECT id FROM catalog_proyecto_entrega WHERE child_person_id = $1 AND unidad = $2
          ORDER BY intento DESC LIMIT 1`,
        [nino, unidad],
      )
    )?.id ?? "";

  beforeAll(async () => {
    for (const [id, user] of [
      [guia, `it-libro-g-${marca}`],
      [otroGuia, `it-libro-o-${marca}`],
      [ninoUser, `it-libro-n-${marca}`],
    ] as const) {
      await execute(
        `INSERT INTO identity_user (id, username, password_hash, updated_at) VALUES ($1, $2, 'x', now())`,
        [id, user],
      );
    }
    await execute(
      `INSERT INTO people_person (id, nombres, apellidos, doc_tipo, doc_numero, country_code, user_id, updated_at)
       VALUES ($1, 'Libro', $2, 'TI', $3, 'CO', $4, now())`,
      [nino, `Prueba${marca}`, doc, ninoUser],
    );
    campaignId = randomUUID();
    const courseId = randomUUID();
    await execute(
      `INSERT INTO catalog_campaign (id, nombre, inicio, fin, final_venta, updated_at)
       VALUES ($1, $2, '2026-10-01', '2027-10-01', '2026-10-01', now())`,
      [campaignId, `IT Libro ${marca}`],
    );
    await execute(
      `INSERT INTO catalog_course (id, campaign_id, tipo, inicio, final_curso, updated_at)
       VALUES ($1, $2, 'JUNIOR', '2026-10-01', '2027-10-01', now())`,
      [courseId, campaignId],
    );
    salon = randomUUID();
    await execute(
      `INSERT INTO scheduling_classroom (id, course_id, nombre, cupo, timezone, holiday_country,
                                         guia_user_id, activo, updated_at)
       VALUES ($1, $2, $3, 10, 'America/Bogota', 'CO', $4, true, now())`,
      [salon, courseId, `Libro ${marca}`, guia],
    );
    const contrato = randomUUID();
    await execute(
      `INSERT INTO contracts_contract (id, titular_id, beneficiario_id, country_code, tipo_curso,
                                       inicio, final_contrato, estado, updated_at)
       VALUES ($1, $2, $2, 'CO', 'JUNIOR', '2026-10-01', '2027-10-01', 'APROBADO', now())`,
      [contrato, nino],
    );
    await execute(
      `INSERT INTO enrollment_enrollment (id, contract_id, child_person_id, classroom_id, estado, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVA', now())`,
      [randomUUID(), contrato, nino, salon],
    );
    // El guía abrió la Unidad 2 (el recorrido abierto llega hasta ahí).
    await execute(
      `INSERT INTO catalog_mision_autorizada (id, child_person_id, curso, nivel, parada)
       VALUES ($1, $2, 'JUNIOR', $3, 2)`,
      [randomUUID(), nino, NIVEL],
    );
  });

  afterAll(async () => {
    await execute(`DELETE FROM enrollment_enrollment WHERE child_person_id = $1`, [nino]);
    await execute(`DELETE FROM contracts_contract WHERE beneficiario_id = $1`, [nino]);
    await execute(`DELETE FROM people_person WHERE id = $1`, [nino]);
    await execute(`DELETE FROM scheduling_classroom WHERE id = $1`, [salon]);
    await execute(`DELETE FROM catalog_campaign WHERE id = $1`, [campaignId]);
    await execute(`DELETE FROM identity_user WHERE id = ANY($1)`, [[guia, otroGuia, ninoUser]]);
    await closePool();
  });

  it("el libro recibe su identidad y las claves de solo lectura", async () => {
    const d = await datosLibroParaAlumno(nino, "JUNIOR", NIVEL);
    expect(d.conIdentidad).toBe(true);
    expect(JSON.parse(d.inyectar["lgs-student-context"] ?? "{}")).toMatchObject({
      level: "Legendary",
      student: { id: doc, username: `it-libro-n-${marca}` },
    });
    expect(d.inyectar[K.pasaporte]).toBe(d.inyectar["lgs-student-context"]);
    expect(d.soloLectura).toContain(K.revisiones);
  });

  it("Rookie recibe el contexto de su pasaporte, sin verificar hasta los 4 proyectos", async () => {
    const d = await datosLibroParaAlumno(nino, "JUNIOR", "ROOKIE");
    expect(d.pasaporte).toMatchObject({
      level: "Rookie",
      award_id: "rookie_compass",
      verified: false,
      student: { id: doc },
    });
    expect(d.pasaporte?.units).toHaveLength(4);
    // Rookie no usa la clave de pasaporte de los demás niveles.
    expect(d.inyectar[clavesLibro("ROOKIE").pasaporte]).toBeUndefined();
    expect((await datosLibroParaAlumno(nino, "JUNIOR", NIVEL)).pasaporte).toBeNull();
  });

  it("entrega → se registra UNA vez; reenviar el historial no duplica", async () => {
    const r1 = await sincronizar({ [K.proyectos]: proyectos([{ id: "a1", unit: 1, attempt: 1 }]) });
    expect(r1.registradas).toBe(1);
    const r2 = await sincronizar({ [K.proyectos]: proyectos([{ id: "a1", unit: 1, attempt: 1 }]) });
    expect(r2.registradas).toBe(0);
    // Lo registrado vuelve al libro como su historial.
    expect(JSON.parse(r2.inyectar[K.proyectos] ?? "{}").submissions).toHaveLength(1);
  });

  it("no acepta otra versión mientras espera revisión, ni una unidad cerrada", async () => {
    const r = await sincronizar({
      [K.proyectos]: proyectos([
        { id: "a1", unit: 1, attempt: 1 },
        { id: "a2", unit: 1, attempt: 2 },
        { id: "c1", unit: 3, attempt: 1 },
      ]),
    });
    expect(r.registradas).toBe(0);
    expect(r.rechazadas.map((x) => x.submission_id).sort()).toEqual(["a2", "c1"]);
  });

  it("el navegador no puede escribirse una revisión: esa clave no se guarda", async () => {
    await sincronizar({
      [K.revisiones]: JSON.stringify({ v: 1, reviews: [{ decision: "approved" }] }),
    });
    const guardada = await queryOne<{ n: number }>(
      `SELECT count(*)::int AS n FROM catalog_libro_estado WHERE child_person_id = $1 AND clave = $2`,
      [nino, K.revisiones],
    );
    expect(guardada?.n).toBe(0);
  });

  it("solo el guía del salón revisa; una aprobación sin puntaje se rechaza", async () => {
    await expect(
      exigirNinoDelGuia(nino, { userId: otroGuia, puedeGestionarCualquierSalon: false }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await exigirNinoDelGuia(nino, { userId: guia, puedeGestionarCualquierSalon: false });

    const id = await ultimaEntrega(1);
    await expect(
      revisarProyecto({
        actorUserId: guia,
        entregaId: id,
        decision: "approved",
        puntajes: [2, 2, 2, 0],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await revisarProyecto({
      actorUserId: guia,
      entregaId: id,
      decision: "changes_requested",
      puntajes: [1, 1, 1, 0],
      comentario: "Add a caption.",
    });
    const d = await datosLibroParaAlumno(nino, "JUNIOR", NIVEL);
    const rev = JSON.parse(d.inyectar[K.revisiones] ?? "{}");
    expect(rev.reviews).toHaveLength(1);
    expect(rev.reviews[0]).toMatchObject({
      unit: 1,
      submission_id: "a1",
      decision: "changes_requested",
      reviewed_by: guia,
    });
  });

  it("tras pedir cambios entra la reentrega; aprobarla la deja aprobada", async () => {
    const r = await sincronizar({
      [K.proyectos]: proyectos([
        { id: "a1", unit: 1, attempt: 1 },
        { id: "a2", unit: 1, attempt: 2 },
      ]),
    });
    expect(r.registradas).toBe(1);
    // Una revisión de la versión ANTERIOR ya no se acepta.
    const vieja = (
      await queryOne<{ id: string }>(
        `SELECT id FROM catalog_proyecto_entrega WHERE child_person_id = $1 AND submission_id = 'a1'`,
        [nino],
      )
    )?.id;
    await expect(
      revisarProyecto({
        actorUserId: guia,
        entregaId: vieja ?? "",
        decision: "approved",
        puntajes: [2, 2, 2, 2],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await revisarProyecto({
      actorUserId: guia,
      entregaId: await ultimaEntrega(1),
      decision: "approved",
      puntajes: [2, 2, 1, 1],
    });
    const libro = await libroDeNino(nino, "JUNIOR", NIVEL);
    expect(libro.proyectos[0]).toMatchObject({ unidad: 1, estado: "approved", limite: 3 });
    expect(libro.proyectos[0]?.entregas).toHaveLength(2);
  });

  it("autorizar una oportunidad más sube el límite (total, no suma)", async () => {
    await expect(
      autorizarEntregaExtra({
        actorUserId: guia,
        childPersonId: nino,
        curso: "JUNIOR",
        nivel: NIVEL,
        unidad: 2,
        maximo: 3,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await autorizarEntregaExtra({
      actorUserId: guia,
      childPersonId: nino,
      curso: "JUNIOR",
      nivel: NIVEL,
      unidad: 2,
      maximo: 4,
    });
    const libro = await libroDeNino(nino, "JUNIOR", NIVEL);
    expect(libro.proyectos[1]?.limite).toBe(4);
    const rev = JSON.parse(
      (await datosLibroParaAlumno(nino, "JUNIOR", NIVEL)).inyectar[K.revisiones] ?? "{}",
    );
    expect(rev.grants[0]).toMatchObject({ unit: 2, max_submissions: 4, authorized_by: guia });
  });

  it("Mis alumnos del guía muestra al niño con lo que reportó el libro", async () => {
    await sincronizar({
      [K.progreso]: JSON.stringify({ attempts: { 1: [{ score_percent: 90, passed: true }] } }),
      [K.proyectos]: proyectos([
        { id: "a1", unit: 1, attempt: 1 },
        { id: "a2", unit: 1, attempt: 2 },
        { id: "b1", unit: 2, attempt: 1 },
      ]),
    });
    const salones = await misAlumnos(guia);
    const alumno = salones.find((s) => s.id === salon)?.alumnos[0];
    expect(alumno).toMatchObject({
      childPersonId: nino,
      evaluacionesAprobadas: 1,
      proyectosAprobados: 1,
      proyectosPorRevisar: 1,
    });
    expect(alumno?.alertas).toContain("Proyecto por revisar");
    expect(await misAlumnos(otroGuia)).toEqual([]);
  });
});
