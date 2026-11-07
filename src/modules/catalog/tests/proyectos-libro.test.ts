import { describe, expect, it } from "vitest";
import {
  type EntregaLibro,
  type EntregaRegistrada,
  clavesLibro,
  clavesSoloLectura,
  contextoAlumno,
  contextoPasaporteRookie,
  leerProyectosLibro,
  nivelDelLibro,
  planificarEntregas,
  problemaRevision,
  proyectosParaLibro,
  puntajesAprueban,
  resumenEvaluacionesLibro,
} from "../domain/proyectos-libro";

const entrega = (
  unit: number,
  attempt: number,
  id = `s${String(unit)}-${String(attempt)}`,
): EntregaLibro => ({
  submission_id: id,
  unit,
  attempt,
  text: "My visitor guide.",
  submitted_at: "2026-11-06T10:00:00.000Z",
});
const registrada = (
  unidad: number,
  intento: number,
  decision: EntregaRegistrada["decision"] = null,
  aprobada = false,
): EntregaRegistrada => ({
  submissionId: `s${String(unidad)}-${String(intento)}`,
  unidad,
  intento,
  decision,
  aprobada,
});
const plan = (
  enviadas: EntregaLibro[],
  registradas: EntregaRegistrada[] = [],
  limite = 3,
  abiertas = [1, 2, 3, 4],
) =>
  planificarEntregas({
    enviadas,
    registradas,
    limite: () => limite,
    unidadAbierta: (u) => abiertas.includes(u),
  });

describe("claves del libro (contrato)", () => {
  it("son las de la tabla del contrato, por nivel", () => {
    expect(clavesLibro("LEGENDARY")).toEqual({
      progreso: "lgs-legendary-assessments-v2",
      practica: "lgs-legendary-v1",
      proyectos: "lgs-legendary-projects-v1",
      revisiones: "lgs-legendary-project-reviews-v1",
      pasaporte: "lgs-legendary-passport",
    });
    expect(nivelDelLibro("ROOKIE")).toBe("Rookie");
  });

  it("la identidad, las revisiones y el pasaporte son de solo lectura para el libro", () => {
    expect(clavesSoloLectura("ELITE")).toEqual([
      "lgs-student-context",
      "lgs-elite-project-reviews-v1",
      "lgs-elite-passport",
    ]);
  });

  it("la identidad va con la forma exacta que lee el libro", () => {
    expect(
      JSON.parse(
        contextoAlumno("JUNIOR", "CHAMPION", { id: "123", name: "Ana Paz", username: "apaz1" }),
      ),
    ).toEqual({
      v: 1,
      course: "JUNIOR",
      level: "Champion",
      student: { id: "123", name: "Ana Paz", username: "apaz1" },
    });
  });
});

describe("revisión del guía", () => {
  it("aprueba con al menos 6 de 8 y sin ceros", () => {
    expect(puntajesAprueban([2, 2, 1, 1])).toBe(true);
    expect(puntajesAprueban([2, 2, 2, 0])).toBe(false); // un cero
    expect(puntajesAprueban([2, 1, 1, 1])).toBe(false); // 5 puntos
  });

  it("rechaza una aprobación que no alcanza, en vez de guardarla", () => {
    expect(problemaRevision({ decision: "approved", puntajes: [2, 2, 2, 0] })).toMatch(/ningún/);
    expect(problemaRevision({ decision: "approved", puntajes: [2, 2, 1, 1] })).toBeNull();
    expect(problemaRevision({ decision: "changes_requested", puntajes: [0, 0, 0, 0] })).toBeNull();
    expect(problemaRevision({ decision: "ok", puntajes: [2, 2, 2, 2] })).toMatch(/decisión/);
    expect(problemaRevision({ decision: "approved", puntajes: [2, 2, 3, 1] })).toMatch(/0 a 2/);
    expect(problemaRevision({ decision: "approved", puntajes: [2, 2, 2] })).toMatch(/0 a 2/);
  });
});

describe("qué entregas del libro se registran", () => {
  it("registra la primera y no duplica lo que el libro reenvía", () => {
    expect(plan([entrega(1, 1)]).aRegistrar).toHaveLength(1);
    const r = plan([entrega(1, 1)], [registrada(1, 1)]);
    expect(r.aRegistrar).toHaveLength(0);
    expect(r.rechazadas).toHaveLength(0);
  });

  it("no acepta otra mientras la anterior espera revisión", () => {
    expect(plan([entrega(1, 2)], [registrada(1, 1)]).rechazadas[0]?.motivo).toMatch(/esperando/);
  });

  it("tras pedir cambios acepta la siguiente oportunidad, y solo la siguiente", () => {
    const previas = [registrada(1, 1, "changes_requested")];
    expect(plan([entrega(1, 2)], previas).aRegistrar).toHaveLength(1);
    expect(plan([entrega(1, 3)], previas).rechazadas[0]?.motivo).toMatch(/siguiente/);
  });

  it("respeta el límite de 3 y lo que autorizó el guía", () => {
    const tres = [
      registrada(1, 1, "changes_requested"),
      registrada(1, 2, "changes_requested"),
      registrada(1, 3, "changes_requested"),
    ];
    expect(plan([entrega(1, 4)], tres).rechazadas[0]?.motivo).toMatch(/oportunidades/);
    expect(plan([entrega(1, 4)], tres, 4).aRegistrar).toHaveLength(1);
  });

  it("no acepta nada en una unidad ya aprobada ni en una cerrada", () => {
    expect(
      plan([entrega(2, 2)], [registrada(2, 1, "approved", true)]).rechazadas[0]?.motivo,
    ).toMatch(/aprobado/);
    expect(plan([entrega(3, 1)], [], 3, [1, 2]).rechazadas[0]?.motivo).toMatch(/abierta/);
  });

  it("rechaza texto vacío o de más de 8000 y unidades sin proyecto", () => {
    expect(plan([{ ...entrega(1, 1), text: "   " }]).rechazadas).toHaveLength(1);
    expect(plan([{ ...entrega(1, 1), text: "x".repeat(8001) }]).rechazadas).toHaveLength(1);
    expect(plan([entrega(0, 1)]).rechazadas[0]?.motivo).toMatch(/sin proyecto/);
  });

  it("dos entregas nuevas de la misma unidad en un envío: solo pasa la primera", () => {
    const r = plan([entrega(1, 1), entrega(1, 2)]);
    expect(r.aRegistrar.map((e) => e.attempt)).toEqual([1]);
    expect(r.rechazadas[0]?.motivo).toMatch(/esperando/);
  });
});

describe("pasaporte de Rookie (confirmación de la plataforma)", () => {
  const alumno = { id: "123", name: "Ana Paz", username: "apaz1" };
  const unidades = [1, 2, 3, 4].map((unidad) => ({
    unidad,
    intentos: 1,
    mejorPuntaje: 90,
    evaluacionAprobada: true,
    juegoCompletado: true,
    recompensa: true,
  }));

  it("lleva lo que reportó el libro y solo se VERIFICA con los 4 proyectos aprobados", () => {
    const sinUno = contextoPasaporteRookie({ alumno, unidades, proyectosAprobados: [1, 2, 3] });
    expect(sinUno).toMatchObject({ level: "Rookie", award_id: "rookie_compass", verified: false });
    expect(sinUno.units[0]).toEqual({
      unit: 1,
      score_percent: 90,
      evaluation_passed: true,
      game_completed: true,
      reward_delivered: true,
    });
    expect(
      contextoPasaporteRookie({ alumno, unidades, proyectosAprobados: [1, 2, 3, 4] }).verified,
    ).toBe(true);
  });

  it("una unidad sin datos va en cero: el libro no la da por cumplida", () => {
    const c = contextoPasaporteRookie({ alumno, unidades: [], proyectosAprobados: [1, 2, 3, 4] });
    expect(c.units).toHaveLength(4);
    expect(c.units[3]).toMatchObject({ score_percent: 0, evaluation_passed: false });
  });
});

describe("lectura de lo que escribe el libro", () => {
  const valor = proyectosParaLibro({
    curso: "JUNIOR",
    nivel: "LEGENDARY",
    alumnoId: "123",
    borradores: { "2": "borrador" },
    entregas: [entrega(1, 1)],
  });

  it("lee entregas y borradores del mismo alumno, curso y nivel", () => {
    const r = leerProyectosLibro(valor, "JUNIOR", "LEGENDARY", "123");
    expect(r.entregas).toHaveLength(1);
    expect(r.borradores).toEqual({ "2": "borrador" });
  });

  it("ignora el de OTRO alumno u otro nivel (cambio de estudiante en la tableta)", () => {
    expect(leerProyectosLibro(valor, "JUNIOR", "LEGENDARY", "999").entregas).toHaveLength(0);
    expect(leerProyectosLibro(valor, "JUNIOR", "ELITE", "123").entregas).toHaveLength(0);
    expect(leerProyectosLibro("{roto", "JUNIOR", "LEGENDARY", "123").entregas).toHaveLength(0);
  });

  it("resume las evaluaciones de los DOS formatos de libro", () => {
    // Legendary/Champion/Elite: banderas.
    const legendary = JSON.stringify({
      attempts: {
        1: [
          { score_percent: 60, passed: false },
          { score_percent: 86.7, passed: true },
        ],
      },
      games: { 1: { completed: true } },
      rewards: { 1: { delivered: true } },
    });
    expect(resumenEvaluacionesLibro(legendary)[0]).toEqual({
      unidad: 1,
      intentos: 2,
      mejorPuntaje: 87,
      evaluacionAprobada: true,
      juegoCompletado: true,
      recompensa: true,
    });
    // Rookie: fechas.
    const rookie = JSON.stringify({
      attempts: { 2: [{ score_percent: 80, passed: true }] },
      games: { 2: { completed_at: "2026-11-01" } },
      rewards: { 2: { delivered_at: "2026-11-01" } },
    });
    expect(resumenEvaluacionesLibro(rookie)[1]).toMatchObject({
      juegoCompletado: true,
      recompensa: true,
    });
    expect(resumenEvaluacionesLibro(null)[0]).toMatchObject({ intentos: 0, mejorPuntaje: null });
  });
});
