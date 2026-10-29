/**
 * Lo que comparten el calendario del mes y la Agenda del día: la sesión tal
 * como la devuelve `/api/scheduling/agenda`, los filtros (Curso, Salón,
 * Advisor y Hora, cada uno con "Todos") y el color de cada campaña.
 */

export interface AgendaSesion {
  id: string;
  fecha: string;
  /**
   * Hora en el reloj de QUIEN MIRA (el calendario la convierte al cargar; el
   * servidor la manda en la del salón). Con ella se agrupa, se ordena y se filtra.
   */
  horaLocal: string;
  /** Hora de PARED del salón (la de su país), para el CSV. */
  horaSalon?: string;
  tipo: string;
  numero: number;
  classroomId: string;
  salon: string;
  cursoTipo: string;
  campania: string;
  cupo: number;
  ocupados: number;
  guia: string | null;
  guiaUserId: string | null;
  startsAt: string;
  pais: string;
  meetingUrl: string | null;
  asistieron: number;
  cerrada: boolean;
  /** Creado a mano (sin horario): se edita y se cancela; la clase del horario se suspende. */
  esEvento: boolean;
  /** Club de una tanda semanal. */
  tandaId: string | null;
  /** Evento SUSPENDIDO desde la Agenda (sigue en el calendario, no se dicta). */
  suspendida: boolean;
  motivoSuspension: string | null;
  /**
   * Club UNO para varios salones: su alcance (null = "Todos" en cada campo) y la
   * etiqueta que se muestra en vez del salón anfitrión. null = evento de su salón.
   */
  alcance: { etiqueta: string; curso: string | null } | null;
}

export interface FiltrosAgenda {
  curso: string;
  /** classroomId: el mismo "Salón 01" existe en todas las campañas. */
  salon: string;
  /** Por NOMBRE del guía: así filtra también los Welcome, que no traen su id. */
  guia: string;
  hora: string;
}

export const SIN_FILTROS: FiltrosAgenda = { curso: "", salon: "", guia: "", hora: "" };

export function hayFiltros(f: FiltrosAgenda): boolean {
  return f.curso !== "" || f.salon !== "" || f.guia !== "" || f.hora !== "";
}

export function filtrarSesiones(sesiones: AgendaSesion[], f: FiltrosAgenda): AgendaSesion[] {
  return sesiones.filter(
    (s) =>
      // Un club con alcance vale para todo curso/salón que cubra, no solo el anfitrión.
      (f.curso === "" ||
        (s.alcance !== null
          ? s.alcance.curso === null || s.alcance.curso === f.curso
          : s.cursoTipo === f.curso)) &&
      (f.salon === "" || s.alcance !== null || s.classroomId === f.salon) &&
      (f.guia === "" || s.guia === f.guia) &&
      (f.hora === "" || s.horaLocal === f.hora),
  );
}

export interface OpcionSalon {
  id: string;
  etiqueta: string;
  curso: string;
}

/** Las opciones de cada filtro salen de lo que hay en el período cargado. */
export function opcionesDeFiltros(sesiones: AgendaSesion[]): {
  salones: OpcionSalon[];
  guias: string[];
  horas: string[];
} {
  const salones = new Map<string, OpcionSalon>();
  const guias = new Set<string>();
  const horas = new Set<string>();
  for (const s of sesiones) {
    // El salón anfitrión de un club con alcance no es "su" salón: no se ofrece.
    if (s.alcance === null)
      salones.set(s.classroomId, {
        id: s.classroomId,
        etiqueta: `${s.campania} · ${s.salon}`,
        curso: s.cursoTipo,
      });
    if (s.guia !== null) guias.add(s.guia);
    horas.add(s.horaLocal);
  }
  return {
    salones: [...salones.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta)),
    guias: [...guias].sort((a, b) => a.localeCompare(b)),
    horas: [...horas].sort(),
  };
}

export interface ColorCampania {
  bg: string;
  borde: string;
  fg: string;
}

const PALETA: ColorCampania[] = [
  { bg: "#e8f0fe", borde: "#4c6ef5", fg: "#1e3a8a" },
  { bg: "#fff4e5", borde: "#f59f00", fg: "#7c4a03" },
  { bg: "#e6fcf5", borde: "#12b886", fg: "#065f46" },
  { bg: "#fdf2f8", borde: "#d6336c", fg: "#831843" },
  { bg: "#f3f0ff", borde: "#7950f2", fg: "#4c1d95" },
  { bg: "#fff9db", borde: "#e0a800", fg: "#6b5300" },
  { bg: "#e7f5ff", borde: "#1c7ed6", fg: "#0b4a75" },
  { bg: "#ebfbee", borde: "#40c057", fg: "#1b5e20" },
];

/**
 * Un color por campaña, por su puesto en la lista ordenada por nombre: dos
 * campañas que se cruzan en el mes no comparten color (hasta 8 a la vez).
 */
export function coloresPorCampania(nombres: string[]): Map<string, ColorCampania> {
  const mapa = new Map<string, ColorCampania>();
  [...new Set(nombres)]
    .sort((a, b) => a.localeCompare(b))
    .forEach((n, i) => mapa.set(n, PALETA[i % PALETA.length]!));
  return mapa;
}

const MESES_CAMPANIA = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

/**
 * El mes y el año que dice el NOMBRE de la campaña ("AGOSTO2026" → 2026·08;
 * también "SETIEMBRE"). Sin mes reconocible, null: va al final.
 */
function mesDeCampania(nombre: string): number | null {
  const n = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace("SETIEMBRE", "SEPTIEMBRE");
  const mes = MESES_CAMPANIA.findIndex((m) => n.includes(m));
  if (mes < 0) return null;
  const anio = Number(/(\d{4})/.exec(n)?.[1] ?? 0);
  return anio * 12 + mes;
}

/** Las campañas en orden de mes (enero a diciembre, año por año). */
export function ordenarCampaniasPorMes(nombres: string[]): string[] {
  return [...nombres].sort((a, b) => {
    const ma = mesDeCampania(a);
    const mb = mesDeCampania(b);
    if (ma !== null && mb !== null && ma !== mb) return ma - mb;
    if (ma === null && mb !== null) return 1;
    if (mb === null && ma !== null) return -1;
    return a.localeCompare(b);
  });
}

export const COLOR_NEUTRO: ColorCampania = { bg: "#eceff1", borde: "#90a4ae", fg: "#37474f" };

export const PAIS_CORTO: Record<string, string> = {
  CL: "Chile",
  CO: "Colombia",
  EC: "Ecuador",
  PE: "Perú",
};
