/**
 * PROYECTOS ESCRITOS DEL LIBRO con revisión del guía (contrato con diseño,
 * `Integracion_Proyectos_LGS.md`, 2026-11-06).
 *
 * El libro escribe las ENTREGAS del niño en su almacenamiento y solo LEE las
 * REVISIONES, que escribe únicamente la plataforma. Todo lo que dice el libro
 * es `browser_self_reported`: aquí vive la regla que el SERVIDOR aplica antes
 * de registrar una entrega o aceptar una revisión, para no confiar en el
 * cliente. La misma regla la usa el libro (`approved`, `limit`, `editable`):
 * si se separaran, el niño vería "aprobado" donde el servidor no.
 *
 * Reglas puras (sin base de datos), probadas en `proyectos-libro.test.ts`.
 */

/** Unidades con proyecto obligatorio (el Welcome es práctica). */
export const UNIDADES_PROYECTO = [1, 2, 3, 4] as const;

/** Entregas permitidas por unidad sin autorización del guía. */
export const ENTREGAS_BASE = 3;
/** Tope que acepta el libro para una autorización. */
export const ENTREGAS_TOPE = 99;
/** Largo máximo del texto de una entrega (y de un borrador). */
export const LARGO_MAXIMO_PROYECTO = 8000;
/** Puntos mínimos para aprobar (de 8). */
export const PUNTOS_MINIMOS = 6;

/** Los cuatro criterios de la rúbrica, EN ESTE ORDEN (el libro los muestra así). */
export const CRITERIOS_PROYECTO = [
  "Cumple la consigna",
  "Vocabulario y gramática de la unidad",
  "Organización y claridad",
  "Ortografía y puntuación",
] as const;

export const DECISIONES_PROYECTO = ["approved", "changes_requested"] as const;
export type DecisionProyecto = (typeof DECISIONES_PROYECTO)[number];

/** Clave del almacenamiento del libro con la identidad que entrega la plataforma. */
export const CLAVE_CONTEXTO_ALUMNO = "lgs-student-context";
/** Evento con el que el libro vuelve a leer sus revisiones. */
export const EVENTO_REVISION_LIBRO = "lgs:project-review-updated";

/** "ROOKIE" → "Rookie": como el libro escribe su nivel. */
export function nivelDelLibro(codigo: string): string {
  const c = codigo.trim().toUpperCase();
  return c.charAt(0) + c.slice(1).toLowerCase();
}

/** Las claves del libro de UN nivel (ver la tabla del contrato). */
export function clavesLibro(nivel: string): {
  progreso: string;
  practica: string;
  proyectos: string;
  revisiones: string;
  pasaporte: string;
} {
  const s = nivel.trim().toLowerCase();
  return {
    progreso: `lgs-${s}-assessments-v2`,
    practica: `lgs-${s}-v1`,
    proyectos: `lgs-${s}-projects-v1`,
    revisiones: `lgs-${s}-project-reviews-v1`,
    pasaporte: `lgs-${s}-passport`,
  };
}

/** Las claves que el libro PUEDE mandar y la plataforma guarda (registro, no progresión). */
export function clavesQueGuarda(nivel: string): string[] {
  const k = clavesLibro(nivel);
  return [k.progreso, k.practica, k.proyectos];
}

/** Las que escribe SOLO la plataforma: el puente no deja que el libro las toque. */
export function clavesSoloLectura(nivel: string): string[] {
  const k = clavesLibro(nivel);
  return [CLAVE_CONTEXTO_ALUMNO, k.revisiones, k.pasaporte];
}

export interface AlumnoLibro {
  id: string;
  name: string;
  username: string;
}

/** Los tres datos que exige el libro: cadenas no vacías de hasta 160. */
export function alumnoValido(a: AlumnoLibro): boolean {
  return [a.id, a.name, a.username].every(
    (v) => typeof v === "string" && v.trim() !== "" && v.length <= 160,
  );
}

/** `lgs-student-context` (y, en Champion/Elite/Legendary, `lgs-<nivel>-passport`). */
export function contextoAlumno(curso: string, nivel: string, alumno: AlumnoLibro): string {
  return JSON.stringify({
    v: 1,
    course: curso,
    level: nivelDelLibro(nivel),
    student: { id: alumno.id, name: alumno.name, username: alumno.username },
  });
}

/** ¿Aprueba? Decisión `approved`, ningún cero y al menos 6 de 8. */
export function puntajesAprueban(puntajes: readonly number[]): boolean {
  return (
    puntajes.length === 4 &&
    puntajes.every((n) => Number.isInteger(n) && n >= 1 && n <= 2) &&
    puntajes.reduce((a, b) => a + b, 0) >= PUNTOS_MINIMOS
  );
}

/**
 * Qué le falta a una revisión para ser válida, o null. Una decisión
 * `approved` con puntajes que no alcanzan se RECHAZA en vez de guardarse: el
 * libro la leería como no aprobada y el guía creería que aprobó.
 */
export function problemaRevision(r: {
  decision: string;
  puntajes: readonly number[];
}): string | null {
  if (!(DECISIONES_PROYECTO as readonly string[]).includes(r.decision)) {
    return "La decisión debe ser aprobar o pedir cambios.";
  }
  if (
    r.puntajes.length !== 4 ||
    !r.puntajes.every((n) => Number.isInteger(n) && n >= 0 && n <= 2)
  ) {
    return "Cada uno de los cuatro criterios va de 0 a 2.";
  }
  if (r.decision === "approved" && !puntajesAprueban(r.puntajes)) {
    return `Para aprobar hacen falta al menos ${String(PUNTOS_MINIMOS)} de 8 puntos y ningún criterio en 0.`;
  }
  return null;
}

/** Una entrega tal como la escribe el libro. */
export interface EntregaLibro {
  submission_id: string;
  unit: number;
  attempt: number;
  text: string;
  submitted_at: string;
}

/** Lee `lgs-<nivel>-projects-v1` y descarta lo que no tiene la forma del contrato. */
export function leerProyectosLibro(
  valor: string | null | undefined,
  curso: string,
  nivel: string,
  alumnoId: string,
): { borradores: Record<string, string>; entregas: EntregaLibro[] } {
  const vacio = { borradores: {}, entregas: [] };
  if (valor == null) return vacio;
  let o: unknown;
  try {
    o = JSON.parse(valor);
  } catch {
    return vacio;
  }
  if (typeof o !== "object" || o === null) return vacio;
  const s = o as Record<string, unknown>;
  if (
    s["v"] !== 1 ||
    s["course"] !== curso ||
    s["level"] !== nivelDelLibro(nivel) ||
    s["student_id"] !== alumnoId
  ) {
    return vacio;
  }
  const borradores: Record<string, string> = {};
  const d = s["drafts"];
  if (typeof d === "object" && d !== null) {
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (["1", "2", "3", "4"].includes(k) && typeof v === "string") {
        borradores[k] = v.slice(0, LARGO_MAXIMO_PROYECTO);
      }
    }
  }
  const lista = Array.isArray(s["submissions"]) ? (s["submissions"] as unknown[]) : [];
  const entregas: EntregaLibro[] = [];
  for (const x of lista) {
    if (typeof x !== "object" || x === null) continue;
    const e = x as Record<string, unknown>;
    if (
      typeof e["submission_id"] === "string" &&
      e["submission_id"].length > 0 &&
      e["submission_id"].length <= 100 &&
      typeof e["unit"] === "number" &&
      typeof e["attempt"] === "number" &&
      typeof e["text"] === "string" &&
      typeof e["submitted_at"] === "string"
    ) {
      entregas.push({
        submission_id: e["submission_id"],
        unit: e["unit"],
        attempt: e["attempt"],
        text: e["text"],
        submitted_at: e["submitted_at"],
      });
    }
  }
  return { borradores, entregas };
}

/** Lo que el servidor ya registró de una unidad, en orden de intento. */
export interface EntregaRegistrada {
  submissionId: string;
  unidad: number;
  intento: number;
  /** Decisión de la ÚLTIMA revisión de esa entrega, si la hay. */
  decision: DecisionProyecto | null;
  aprobada: boolean;
}

/**
 * Qué entregas nuevas del libro se REGISTRAN. La misma regla que el libro
 * (`editable`), aplicada en el servidor: unidad abierta, texto con contenido y
 * ≤ 8000, intento siguiente al último registrado, dentro del límite, sin una
 * entrega esperando revisión y con la unidad aún sin aprobar. Lo ya registrado
 * (mismo `submission_id`) se ignora: el libro reenvía su historial completo.
 */
export function planificarEntregas(input: {
  enviadas: readonly EntregaLibro[];
  registradas: readonly EntregaRegistrada[];
  /** Entregas permitidas por unidad (3, o lo que autorizó el guía). */
  limite: (unidad: number) => number;
  unidadAbierta: (unidad: number) => boolean;
}): { aRegistrar: EntregaLibro[]; rechazadas: { submission_id: string; motivo: string }[] } {
  const ya = new Set(input.registradas.map((r) => r.submissionId));
  const porUnidad = new Map<number, EntregaRegistrada[]>();
  for (const r of input.registradas) {
    porUnidad.set(r.unidad, [...(porUnidad.get(r.unidad) ?? []), r]);
  }
  const aRegistrar: EntregaLibro[] = [];
  const rechazadas: { submission_id: string; motivo: string }[] = [];
  const nuevas = input.enviadas
    .filter((e) => !ya.has(e.submission_id))
    .sort((a, b) => a.unit - b.unit || a.attempt - b.attempt);
  for (const e of nuevas) {
    const rechazar = (motivo: string) =>
      rechazadas.push({ submission_id: e.submission_id, motivo });
    if (!(UNIDADES_PROYECTO as readonly number[]).includes(e.unit)) {
      rechazar("Unidad sin proyecto.");
      continue;
    }
    const texto = e.text.trim();
    if (texto === "" || texto.length > LARGO_MAXIMO_PROYECTO) {
      rechazar("Texto vacío o de más de 8000 caracteres.");
      continue;
    }
    if (!input.unidadAbierta(e.unit)) {
      rechazar("La unidad no está abierta.");
      continue;
    }
    const previas = porUnidad.get(e.unit) ?? [];
    const ultima = previas.at(-1);
    if (previas.some((p) => p.aprobada)) {
      rechazar("El proyecto de esa unidad ya está aprobado.");
      continue;
    }
    if (ultima !== undefined && ultima.decision === null) {
      rechazar("Hay una entrega esperando la revisión del guía.");
      continue;
    }
    if (previas.length >= input.limite(e.unit)) {
      rechazar("No le quedan oportunidades de entrega.");
      continue;
    }
    if (e.attempt !== previas.length + 1) {
      rechazar("El número de oportunidad no es el siguiente.");
      continue;
    }
    aRegistrar.push(e);
    porUnidad.set(e.unit, [
      ...previas,
      {
        submissionId: e.submission_id,
        unidad: e.unit,
        intento: e.attempt,
        decision: null,
        aprobada: false,
      },
    ]);
    ya.add(e.submission_id);
  }
  return { aRegistrar, rechazadas };
}

/** `lgs-<nivel>-projects-v1` armado desde lo registrado (la verdad del servidor). */
export function proyectosParaLibro(input: {
  curso: string;
  nivel: string;
  alumnoId: string;
  borradores: Record<string, string>;
  entregas: readonly EntregaLibro[];
}): string {
  return JSON.stringify({
    v: 1,
    course: input.curso,
    level: nivelDelLibro(input.nivel),
    student_id: input.alumnoId,
    drafts: input.borradores,
    submissions: input.entregas,
  });
}

/** Una revisión y una autorización, como las lee el libro. */
export interface RevisionLibro {
  unit: number;
  submission_id: string;
  decision: DecisionProyecto;
  scores: number[];
  feedback: string;
  reviewed_by: string;
  reviewed_at: string;
}
export interface AutorizacionLibro {
  unit: number;
  max_submissions: number;
  authorized_by: string;
  authorized_at: string;
}

/** `lgs-<nivel>-project-reviews-v1`: revisiones en orden cronológico y autorizaciones. */
export function revisionesParaLibro(input: {
  curso: string;
  nivel: string;
  alumnoId: string;
  revisiones: readonly RevisionLibro[];
  autorizaciones: readonly AutorizacionLibro[];
}): string {
  return JSON.stringify({
    v: 1,
    course: input.curso,
    level: nivelDelLibro(input.nivel),
    student_id: input.alumnoId,
    reviews: input.revisiones,
    grants: input.autorizaciones,
  });
}

/** Resultado de una unidad en el libro (lo que reportó el navegador). */
export interface UnidadLibro {
  unidad: number;
  intentos: number;
  mejorPuntaje: number | null;
  evaluacionAprobada: boolean;
  juegoCompletado: boolean;
  recompensa: boolean;
}

/**
 * Resume `lgs-<nivel>-assessments-v2` para el guía: intentos, mejor puntaje y
 * si aprobó, jugó y recibió el souvenir. Entiende las dos formas que usan los
 * libros: Rookie marca con la fecha (`games[u] = {completed_at}`,
 * `rewards[u] = {delivered_at}`) y los demás con la bandera
 * (`games[u].completed`, `rewards[u].delivered`).
 * Es lo que DICE el navegador, no una calificación de la plataforma.
 */
export function resumenEvaluacionesLibro(valor: string | null | undefined): UnidadLibro[] {
  let o: Record<string, unknown> = {};
  try {
    const p: unknown = valor == null ? {} : JSON.parse(valor);
    if (typeof p === "object" && p !== null && !Array.isArray(p)) o = p as Record<string, unknown>;
  } catch {
    o = {};
  }
  const mapa = (k: string) =>
    typeof o[k] === "object" && o[k] !== null ? (o[k] as Record<string, unknown>) : {};
  const intentos = mapa("attempts");
  const juegos = mapa("games");
  const premios = mapa("rewards");
  const hecho = (v: unknown, campo: string) => {
    if (v === true) return true;
    if (typeof v !== "object" || v === null) return false;
    const r = v as Record<string, unknown>;
    return r[campo] === true || typeof r[`${campo}_at`] === "string";
  };
  return UNIDADES_PROYECTO.map((u) => {
    const lista = Array.isArray(intentos[String(u)]) ? (intentos[String(u)] as unknown[]) : [];
    const puntajes = lista
      .map((a) =>
        typeof a === "object" && a !== null
          ? (a as Record<string, unknown>)["score_percent"]
          : null,
      )
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return {
      unidad: u,
      intentos: lista.length,
      mejorPuntaje: puntajes.length > 0 ? Math.round(Math.max(...puntajes)) : null,
      evaluacionAprobada: lista.some(
        (a) =>
          typeof a === "object" && a !== null && (a as Record<string, unknown>)["passed"] === true,
      ),
      juegoCompletado: hecho(juegos[String(u)], "completed"),
      recompensa: hecho(premios[String(u)], "delivered"),
    };
  });
}
