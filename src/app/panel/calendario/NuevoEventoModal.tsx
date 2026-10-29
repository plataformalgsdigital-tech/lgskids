"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Crear un evento suelto en el calendario: sesión extra, club o taller.
 *
 * Solo administración (`eventos.crear`). El enlace de Zoom NO se escribe: se
 * hereda del guía asignado, porque un guía dicta siempre desde su propia sala
 * y copiarlo a mano acabaría con enlaces desactualizados.
 *
 * Los selectores en cascada (campaña → país → curso → salón) se arman con la
 * lista de salones que la pantalla ya tiene cargada: no hacen falta llamadas
 * nuevas por cada paso.
 */

const MAX_COMPARTIDOS = 3;

export interface SalonOpcion {
  id: string;
  nombre: string;
  curso: string;
  campania: string;
  holidayCountry: string;
  cupo: number;
}

interface Guia {
  id: string;
  username: string;
  nombre: string;
  zoomUrl: string | null;
}

/** Un link de la tabla Links de Clubes (Sesiones › Links de Clubes). */
interface LinkClub {
  id: string;
  nombre: string;
  /** 0 = domingo … 6 = sábado, como `Date.getDay()`. */
  diaSemana: number;
  horario: string;
  link: string;
  activo: boolean;
}

const NIVELES = ["ROOKIE", "CHAMPION", "ELITE", "LEGENDARY", "ULTIMATE"] as const;

/** Aforo por defecto del evento interno: no cuelga de un salón del que heredar cupo. */
const LIMITE_ADMIN_DEFECTO = 25;
/** Tipos de una clase: la dicta un salón. */
const TIPOS_ACADEMICO = [
  { valor: "SESION", etiqueta: "Sesión" },
  { valor: "CLUB", etiqueta: "Club" },
  { valor: "TALLER", etiqueta: "Taller" },
  // No es de un salón: lo agenda el niño al crear su perfil, antes del curso.
  { valor: "WELCOME", etiqueta: "Welcome" },
] as const;

interface CampaniaOpcion {
  id: string;
  nombre: string;
  estado: string;
  cursoInicio: string | null;
  cursoFin: string | null;
}

/**
 * La tanda de clubs por defecto: el inicio y el fin de los cursos de la campaña
 * EN MATRÍCULA o, si no hay, de la ACTIVA (la lista viene de la más reciente a
 * la más antigua). Se puede cambiar en el formulario.
 */
function tandaPorDefecto(lista: CampaniaOpcion[]): { inicio: string; fin: string; de: string } {
  const c =
    lista.find((x) => x.estado === "EN_MATRICULA" && x.cursoInicio !== null) ??
    lista.find((x) => x.estado === "ACTIVA" && x.cursoInicio !== null);
  return { inicio: c?.cursoInicio ?? "", fin: c?.cursoFin ?? "", de: c?.nombre ?? "" };
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * Sesión extra, club o taller ABIERTO a niños de otros salones (Academic
 * management › Agendar, e Inscripción Clubes del propio niño): se les ofrece si
 * coinciden con su campaña, curso, país y salón, y con el nivel del evento;
 * null = "Todos". Cerrado, su lista son solo sus salones.
 */
export interface AperturaEvento {
  abierto: boolean;
  campaignId: string | null;
  curso: "JUNIOR" | "YOUNGSTER" | null;
  pais: "CL" | "CO" | "EC" | "PE" | null;
  classroomId: string | null;
}
export const APERTURA_CERRADA: AperturaEvento = {
  abierto: false,
  campaignId: null,
  curso: null,
  pais: null,
  classroomId: null,
};

/** Reloj de cada país (el de sus salones), para escribir la hora en él. */
const ZONA_PAIS: Record<string, { zona: string; nombre: string }> = {
  CL: { zona: "America/Santiago", nombre: "Chile" },
  CO: { zona: "America/Bogota", nombre: "Colombia" },
  EC: { zona: "America/Guayaquil", nombre: "Ecuador" },
  PE: { zona: "America/Lima", nombre: "Perú" },
};

const PAISES_APERTURA = [
  ["CL", "Chile"],
  ["CO", "Colombia"],
  ["EC", "Ecuador"],
  ["PE", "Perú"],
] as const;

/**
 * Un evento YA creado que se abre para EDITAR. Cada clase guarda con su propia
 * ruta y conserva a sus inscritos (niños agendados, lista del salón o guías
 * convocados). El tipo no cambia de clase: un Welcome sigue siendo Welcome.
 */
export type EventoEditable =
  | {
      clase: "welcome";
      id: string;
      startsAt: string;
      duracionMin: number;
      guiaUserId: string;
      campania: string | null;
      pais: string | null;
      curso: string | null;
      classroomId: string | null;
      nivel: string | null;
      limiteUsuarios: number;
      observaciones: string | null;
      enMarcha: boolean;
      inscritos: number;
    }
  | {
      clase: "suelto";
      id: string;
      tipo: string;
      startsAt: string;
      /** Zona del salón: la hora del evento se escribe en su reloj. */
      timezone: string;
      duracionMin: number;
      guiaUserId: string | null;
      nivel: string | null;
      limiteUsuarios: number | null;
      observaciones: string | null;
      salon: string;
      compartido: boolean;
      /** Club de una tanda semanal: se puede editar esa sesión o toda la tanda. */
      tanda: { id: string; inicio: string; fin: string; futuras: number } | null;
      apertura: AperturaEvento;
      /** Club con link propio (Links de Clubes) en vez de la sala del advisor. */
      linkClubId: string | null;
    }
  | {
      clase: "admin";
      id: string;
      tipo: string;
      titulo: string | null;
      startsAt: string;
      duracionMin: number;
      campania: string | null;
      pais: string | null;
      curso: string | null;
      classroomId: string | null;
      nivel: string | null;
      limiteUsuarios: number | null;
      observaciones: string | null;
      guiaUserIds: string[];
    };

/** Fecha y hora de PARED de un instante en una zona (o en la del navegador). */
function pared(iso: string, zona?: string): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  return { fecha: `${p("year")}-${p("month")}-${p("day")}`, hora: `${p("hour")}:${p("minute")}` };
}

interface TipoAdmin {
  valor: string;
  etiqueta: string;
}

/** Horas enteras entre dos duraciones en minutos, ambas incluidas. */
function horasEntre(minMin: number, maxMin: number): number[] {
  const horas: number[] = [];
  for (let h = Math.ceil(minMin / 60); h <= Math.floor(maxMin / 60); h++) horas.push(h);
  return horas;
}

const campo: CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.92rem",
  fontFamily: "inherit",
};
const rotulo: CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 700,
  marginBottom: "0.2rem",
};
const boton: CSSProperties = {
  padding: "0.55rem 1.1rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

export function NuevoEventoModal({
  salones,
  modo,
  editar,
  onCerrar,
  onCreado,
}: {
  salones: SalonOpcion[];
  /**
   * "academico" crea sesiones en salones (los ven los alumnos matriculados).
   * "administrativo" crea un evento interno cuya audiencia son GUÍAS elegidos.
   */
  modo: "academico" | "administrativo";
  /** Si viene, el formulario EDITA ese evento en vez de crear uno. */
  editar?: EventoEditable;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const esAdmin = modo === "administrativo";
  const [guias, setGuias] = useState<Guia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Al editar, todo arranca con lo que el evento ya tiene. La hora de un evento
  // suelto es la de PARED de su salón; la del Welcome y la del administrativo,
  // la del reloj de quien edita (son instantes).
  const inicio =
    editar !== undefined
      ? pared(editar.startsAt, editar.clase === "suelto" ? editar.timezone : undefined)
      : null;
  const hoy = new Date();
  const [fecha, setFecha] = useState(
    inicio?.fecha ??
      `${String(hoy.getFullYear())}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`,
  );
  const [hora, setHora] = useState(inicio?.hora ?? "16:00");
  const [duracion, setDuracion] = useState(editar?.duracionMin ?? 60);
  // En modo administrativo arranca vacío y toma el primer tipo que sirva la
  // API: fijar un literal aquí sería una cuarta copia del vocabulario.
  const [tipo, setTipo] = useState<string>(
    editar?.clase === "welcome"
      ? "WELCOME"
      : editar !== undefined
        ? editar.tipo
        : esAdmin
          ? ""
          : "SESION",
  );
  const [campania, setCampania] = useState(
    editar !== undefined && editar.clase !== "suelto" ? (editar.campania ?? "") : "",
  );
  const [pais, setPais] = useState(
    editar !== undefined && editar.clase !== "suelto" ? (editar.pais ?? "") : "",
  );
  const [curso, setCurso] = useState(
    editar !== undefined && editar.clase !== "suelto" ? (editar.curso ?? "") : "",
  );
  const [salonPrincipal, setSalonPrincipal] = useState(
    editar !== undefined && editar.clase !== "suelto" ? (editar.classroomId ?? "") : "",
  );
  const [nivel, setNivel] = useState(editar?.nivel ?? "");
  const [limite, setLimite] = useState(
    editar !== undefined
      ? editar.limiteUsuarios !== null
        ? String(editar.limiteUsuarios)
        : ""
      : esAdmin
        ? String(LIMITE_ADMIN_DEFECTO)
        : "",
  );
  const [guiaUserId, setGuiaUserId] = useState(
    editar !== undefined && editar.clase !== "admin" ? (editar.guiaUserId ?? "") : "",
  );
  const [observaciones, setObservaciones] = useState(editar?.observaciones ?? "");
  const [compartir, setCompartir] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  // Audiencia del evento administrativo: qué guías lo verán.
  const [titulo, setTitulo] = useState(editar?.clase === "admin" ? (editar.titulo ?? "") : "");
  const [audiencia, setAudiencia] = useState<string[]>(
    editar?.clase === "admin" ? editar.guiaUserIds : [],
  );
  /** Editando un evento suelto: su salón no cambia (se elige al crearlo). */
  const salonFijo = editar?.clase === "suelto";
  // Vocabulario y rangos del dominio, servidos por la API.
  const [tiposAdmin, setTiposAdmin] = useState<TipoAdmin[]>([]);
  const [horasAdmin, setHorasAdmin] = useState<number[]>([]);
  const [horasTaller, setHorasTaller] = useState<number[]>([]);
  // El Welcome filtra por campaña con su id, y por defecto elige la que está
  // EN MATRÍCULA: es la de los niños que están por empezar.
  const [campaniasLista, setCampaniasLista] = useState<CampaniaOpcion[]>([]);
  const esWelcome = !esAdmin && tipo === "WELCOME";
  // Welcome para niños que entran con el curso YA andando: no exige ser antes
  // del inicio. Se marca solo al elegir una campaña que ya no está en matrícula.
  const [enMarcha, setEnMarcha] = useState(editar?.clase === "welcome" ? editar.enMarcha : false);
  // Sesión/Taller abiertos a otros salones (Academic management › Agendar).
  const [apertura, setApertura] = useState<AperturaEvento>(
    editar?.clase === "suelto" ? editar.apertura : APERTURA_CERRADA,
  );
  // Un CLUB no lleva apertura en el formulario: quién puede inscribirse lo dicen
  // su campaña, país, curso, salón y nivel. Con "Todos" el servidor lo guarda como
  // UN evento con ese alcance; al editar no se manda, para conservarlo.
  const aperturaEnviada = tipo === "CLUB" ? undefined : apertura;
  // TANDA de clubs: el Club se repite cada semana entre estas dos fechas.
  const [tandaInicio, setTandaInicio] = useState("");
  const [tandaFin, setTandaFin] = useState("");
  const [tandaDe, setTandaDe] = useState("");
  /** Editando un Club de una tanda: el cambio va a esa sesión o a toda la tanda. */
  const tandaEditada = editar?.clase === "suelto" ? editar.tanda : null;
  const [todaLaTanda, setTodaLaTanda] = useState(false);
  const esTanda = !esAdmin && tipo === "CLUB" && editar === undefined;
  // "Link diferente al del Advisor": solo Club; se elige de Links de Clubes
  // entre los del día de la semana de la fecha.
  const esClub = !esAdmin && tipo === "CLUB";
  const [linksClub, setLinksClub] = useState<LinkClub[]>([]);
  const linkInicial = editar?.clase === "suelto" ? editar.linkClubId : null;
  const [linkPropio, setLinkPropio] = useState(linkInicial !== null);
  const [linkClubId, setLinkClubId] = useState(linkInicial ?? "");
  const diaFecha = fecha !== "" ? new Date(`${fecha}T12:00:00`).getDay() : -1;
  // Los activos del día, más el que ya tenía el Club que se edita aunque se
  // haya desactivado: cambiarle el advisor no puede obligar a cambiarle el link.
  const linksDelDia = linksClub.filter(
    (l) => l.diaSemana === diaFecha && (l.activo || l.id === linkInicial),
  );
  const linkElegido = linksDelDia.find((l) => l.id === linkClubId) ?? null;
  const usaLinkClub = esClub && linkPropio;

  const cargarGuias = useCallback(async () => {
    const res = await apiFetch("/api/scheduling/eventos");
    if (!res.ok) return;
    const d = (await res.json()) as {
      guias: Guia[];
      tiposAdmin: TipoAdmin[];
      duracionAdmin: { min: number; max: number };
      duracionesTaller: number[];
      linksClub: LinkClub[];
    };
    setGuias(d.guias);
    setLinksClub(d.linksClub);
    setTiposAdmin(d.tiposAdmin);
    if (esAdmin && d.tiposAdmin.length > 0) {
      setTipo((actual) =>
        d.tiposAdmin.some((x) => x.valor === actual) ? actual : (d.tiposAdmin[0]?.valor ?? ""),
      );
    }
    setHorasAdmin(horasEntre(d.duracionAdmin.min, d.duracionAdmin.max));
    setHorasTaller(d.duracionesTaller.map((m) => m / 60));
  }, [esAdmin]);

  useEffect(() => {
    async function inicial() {
      await cargarGuias();
    }
    void inicial();
  }, [cargarGuias]);

  useEffect(() => {
    if (esAdmin) return;
    async function cargarCampanias() {
      const res = await apiFetch("/api/catalog/campaigns");
      if (res.ok) {
        const lista = ((await res.json()) as { campanias: CampaniaOpcion[] }).campanias;
        setCampaniasLista(lista);
        const t = tandaPorDefecto(lista);
        setTandaInicio(t.inicio);
        setTandaFin(t.fin);
        setTandaDe(t.de);
      }
    }
    void cargarCampanias();
  }, [esAdmin]);

  /** Al pasar a Welcome: campaña en matrícula, todos los países/cursos/salones, Rookie. */
  function elegirTipo(nuevo: string) {
    const veniaDeWelcome = tipo === "WELCOME";
    setTipo(nuevo);
    if (nuevo === "TALLER" && duracion !== 60 && duracion !== 120) setDuracion(60);
    if (nuevo === "WELCOME") {
      setCampania(campaniasLista.find((c) => c.estado === "EN_MATRICULA")?.nombre ?? "");
      setPais("");
      setCurso("");
      setSalonPrincipal("");
      setNivel("ROOKIE");
      setLimite("");
      setEnMarcha(false);
      setCompartir(false);
      setExtras([]);
    } else if (veniaDeWelcome) {
      setCampania("");
      setPais("");
      setCurso("");
      setSalonPrincipal("");
      setNivel("");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // Cascada: cada nivel del filtro se calcula sobre el anterior, y vacío = TODOS
  // en los tres modos. En el ADMINISTRATIVO son contexto; en el Welcome, filtros
  // de quién puede agendarlo; en el ACADÉMICO, dónde se dicta: con salón "Todos"
  // la clase se crea, como UNA clase compartida, en todos los salones activos
  // que coincidan (los resuelve el servidor).
  const libre = (valor: string) => valor === "";
  const campanias = [...new Set(salones.map((s) => s.campania))];
  const paises = [
    ...new Set(
      salones
        .filter((s) => libre(campania) || s.campania === campania)
        .map((s) => s.holidayCountry),
    ),
  ];
  const cursos = [
    ...new Set(
      salones
        .filter(
          (s) =>
            (libre(campania) || s.campania === campania) &&
            (libre(pais) || s.holidayCountry === pais),
        )
        .map((s) => s.curso),
    ),
  ];
  const salonesFiltrados = salones.filter(
    (s) =>
      (libre(campania) || s.campania === campania) &&
      (libre(pais) || s.holidayCountry === pais) &&
      (libre(curso) || s.curso === curso),
  );
  // Para compartir se ofrecen los salones de la MISMA campaña y país, de
  // cualquier curso: compartir entre cursos es justo el caso de uso.
  const salonesCompartibles = salones.filter(
    (s) => s.campania === campania && s.holidayCountry === pais && s.id !== salonPrincipal,
  );

  const guia = guias.find((g) => g.id === guiaUserId) ?? null;
  const seleccionados = [salonPrincipal, ...(compartir ? extras : [])].filter((x) => x !== "");
  /** Clase académica con salón "Todos": va a todos los salones que coincidan. */
  const todosLosSalones = !esAdmin && !esWelcome && !salonFijo && salonPrincipal === "";
  const listo = esAdmin
    ? fecha !== "" && hora !== "" && audiencia.length > 0
    : esWelcome
      ? fecha !== "" && hora !== "" && guiaUserId !== "" && Number(limite) > 0
      : fecha !== "" &&
        hora !== "" &&
        (salonFijo || salonPrincipal !== "" || salonesFiltrados.length > 0) &&
        guiaUserId !== "" &&
        (!esTanda || (tandaInicio !== "" && tandaFin !== "")) &&
        (!usaLinkClub || linkElegido !== null);
  /** El link que se manda: el elegido si es un Club con link propio; si no, ninguno. */
  const linkEnviado = usaLinkClub ? (linkElegido?.id ?? null) : null;
  const zonaNavegador = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Con un PAÍS elegido, la hora se escribe en el reloj de ESE país (un Club de
  // Chile a las 18:00 se crea poniendo 18:00, se escriba desde donde se escriba);
  // con "Todos los países", en el reloj de quien la escribe.
  const zonaHora = ZONA_PAIS[pais]?.zona ?? zonaNavegador;
  const relojHora =
    ZONA_PAIS[pais] !== undefined
      ? `hora de ${ZONA_PAIS[pais].nombre}`
      : `tu reloj (${zonaNavegador})`;

  async function crear() {
    setOcupado(true);
    setError(null);
    try {
      const cuerpo = esWelcome
        ? {
            fecha,
            horaLocal: hora,
            zona: zonaHora,
            duracionMin: duracion,
            guiaUserId,
            campaignId: campaniasLista.find((c) => c.nombre === campania)?.id ?? null,
            pais: pais === "" ? null : pais,
            curso: curso === "" ? null : curso,
            classroomId: salonPrincipal === "" ? null : salonPrincipal,
            nivel: nivel === "" ? null : nivel,
            limiteUsuarios: Number(limite),
            observaciones: observaciones.trim() === "" ? null : observaciones,
            enMarcha,
          }
        : salonFijo
          ? {
              // Evento suelto en edición: el salón (o salones) no cambia.
              tipo,
              fecha,
              horaLocal: hora,
              duracionMin: duracion,
              nivel: nivel === "" ? null : nivel,
              limiteUsuarios: limite === "" ? null : Number(limite),
              guiaUserId,
              observaciones: observaciones.trim() === "" ? null : observaciones,
              apertura: aperturaEnviada,
              todaLaTanda: tandaEditada !== null && todaLaTanda,
              linkClubId: linkEnviado,
            }
          : esAdmin
            ? {
                tipo,
                titulo: titulo.trim() === "" ? null : titulo,
                fecha,
                horaLocal: hora,
                duracionMin: duracion,
                zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
                pais: pais === "" ? null : pais,
                campania: campania === "" ? null : campania,
                curso: curso === "" ? null : curso,
                classroomId: salonPrincipal === "" ? null : salonPrincipal,
                nivel: nivel === "" ? null : nivel,
                limiteUsuarios: limite === "" ? null : Number(limite),
                observaciones: observaciones.trim() === "" ? null : observaciones,
                guiaUserIds: audiencia,
              }
            : {
                ...(todosLosSalones
                  ? {
                      todos: {
                        campaignId: campaniasLista.find((c) => c.nombre === campania)?.id ?? null,
                        pais: pais === "" ? null : pais,
                        curso: curso === "" ? null : curso,
                      },
                      // La hora va en el reloj del país elegido o, con "Todos", en el de quien la escribe.
                      zona: zonaHora,
                    }
                  : { classroomIds: seleccionados }),
                tipo,
                fecha,
                horaLocal: hora,
                duracionMin: duracion,
                nivel: nivel === "" ? null : nivel,
                limiteUsuarios: limite === "" ? null : Number(limite),
                guiaUserId,
                observaciones: observaciones.trim() === "" ? null : observaciones,
                apertura: aperturaEnviada,
                tanda: esTanda ? { inicio: tandaInicio, fin: tandaFin } : null,
                linkClubId: linkEnviado,
              };
      const base = esWelcome
        ? "/api/scheduling/welcomes"
        : esAdmin
          ? "/api/scheduling/eventos-admin"
          : "/api/scheduling/eventos";
      const res = await apiFetch(editar !== undefined ? `${base}/${editar.id}` : base, {
        method: editar !== undefined ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(
          c.error?.message ??
            (editar !== undefined
              ? "No se pudo guardar el evento."
              : "No se pudo crear el evento."),
        );
        return;
      }
      onCreado();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Crear evento"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(8,11,24,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "1.5rem 1rem",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "44rem",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e3e7f0",
          }}
        >
          <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>
            {editar !== undefined ? "✏️ Editar " : ""}
            {esAdmin
              ? editar !== undefined
                ? "evento administrativo"
                : "🏛️ Evento administrativo"
              : editar !== undefined
                ? "evento académico"
                : "🎓 Evento académico"}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{ ...boton, borderRadius: "50%", width: "2.2rem", height: "2.2rem", padding: 0 }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: "1.1rem 1.25rem 1.3rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem",
          }}
        >
          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
              {error}
            </p>
          )}

          {editar !== undefined && (
            <p
              style={{
                margin: 0,
                padding: "0.6rem 0.8rem",
                borderRadius: "0.6rem",
                background: "#fff8e1",
                border: "1px solid #ffe082",
                fontSize: "0.83rem",
                lineHeight: 1.45,
              }}
            >
              {editar.clase === "welcome"
                ? `Tiene ${String(editar.inscritos)} niño${editar.inscritos === 1 ? "" : "s"} agendado${editar.inscritos === 1 ? "" : "s"}: siguen agendados con los cambios. El límite no puede quedar por debajo de esa cifra.`
                : editar.clase === "suelto"
                  ? `Salón: ${editar.salon}${editar.compartido ? " (evento compartido: el cambio se aplica en todos sus salones)" : ""}. La lista sale de las matrículas del salón, así que los niños siguen inscritos.`
                  : "Los guías que sigan en la audiencia conservan su asistencia; los que se quiten dejan de verlo."}
            </p>
          )}

          {esAdmin && (
            <div>
              <label style={rotulo} htmlFor="ev-titulo">
                Título del evento
              </label>
              <input
                id="ev-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Reunión de coordinación, capacitación…"
                style={campo}
              />
            </div>
          )}

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.7rem" }}
            className="ev-tres"
          >
            <div>
              <label style={rotulo} htmlFor="ev-fecha">
                Fecha *
              </label>
              <input
                id="ev-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                style={campo}
              />
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-hora">
                Hora *{/* En qué reloj se escribe: el del país elegido o el de quien escribe. */}
                {(todosLosSalones || esWelcome) && ZONA_PAIS[pais] !== undefined && (
                  <span style={{ fontWeight: 600, color: "#1565c0" }}>
                    {" "}
                    (hora de {ZONA_PAIS[pais].nombre})
                  </span>
                )}
              </label>
              <input
                id="ev-hora"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                style={campo}
              />
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-dur">
                Duración {esAdmin || tipo === "TALLER" ? "" : "(min)"}
              </label>
              {esAdmin || tipo === "TALLER" ? (
                <select
                  id="ev-dur"
                  value={duracion}
                  onChange={(e) => setDuracion(Number(e.target.value))}
                  style={campo}
                >
                  {(esAdmin ? horasAdmin : horasTaller).map((h) => (
                    <option key={h} value={h * 60}>
                      {h} hora{h === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="ev-dur"
                  type="number"
                  min={15}
                  max={300}
                  value={duracion}
                  onChange={(e) => setDuracion(Number(e.target.value))}
                  style={campo}
                />
              )}
            </div>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}
            className="ev-dos"
          >
            <div>
              <label style={rotulo} htmlFor="ev-tipo">
                Tipo de evento *
              </label>
              <select
                id="ev-tipo"
                value={tipo}
                onChange={(e) => elegirTipo(e.target.value)}
                style={campo}
              >
                {(esAdmin
                  ? tiposAdmin
                  : TIPOS_ACADEMICO.filter((t) =>
                      // Editando, el tipo no cambia de clase: un Welcome sigue
                      // siendo Welcome y una clase suelta no se vuelve Welcome.
                      editar === undefined
                        ? true
                        : editar.clase === "welcome"
                          ? t.valor === "WELCOME"
                          : t.valor !== "WELCOME",
                    )
                ).map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            {!salonFijo && (
              <>
                <div>
                  <label style={rotulo} htmlFor="ev-camp">
                    Campaña
                  </label>
                  <select
                    id="ev-camp"
                    value={campania}
                    onChange={(e) => {
                      setCampania(e.target.value);
                      if (esWelcome) {
                        const estado = campaniasLista.find(
                          (c) => c.nombre === e.target.value,
                        )?.estado;
                        setEnMarcha(estado !== undefined && estado !== "EN_MATRICULA");
                      }
                      setPais("");
                      setCurso("");
                      setSalonPrincipal("");
                      setExtras([]);
                    }}
                    style={campo}
                  >
                    <option value="">Todas las campañas</option>
                    {campanias.map((c) => (
                      <option key={c} value={c}>
                        {c}
                        {esWelcome &&
                        campaniasLista.find((x) => x.nombre === c)?.estado === "EN_MATRICULA"
                          ? " (en matrícula)"
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={rotulo} htmlFor="ev-pais">
                    País
                  </label>
                  <select
                    id="ev-pais"
                    value={pais}
                    onChange={(e) => {
                      setPais(e.target.value);
                      setCurso("");
                      setSalonPrincipal("");
                      setExtras([]);
                    }}
                    style={campo}
                  >
                    <option value="">Todos los países</option>
                    {paises.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={rotulo} htmlFor="ev-curso">
                    Curso
                  </label>
                  <select
                    id="ev-curso"
                    value={curso}
                    onChange={(e) => {
                      setCurso(e.target.value);
                      setSalonPrincipal("");
                    }}
                    style={campo}
                  >
                    <option value="">Todos los cursos</option>
                    {cursos.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={rotulo} htmlFor="ev-salon">
                    Salón
                  </label>
                  <select
                    id="ev-salon"
                    value={salonPrincipal}
                    onChange={(e) => setSalonPrincipal(e.target.value)}
                    style={campo}
                  >
                    <option value="">Todos los salones</option>
                    {salonesFiltrados.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                        {curso === "" && !s.nombre.includes(s.curso) ? ` · ${s.curso}` : ""}
                        {campania === "" ? ` · ${s.campania}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label style={rotulo} htmlFor="ev-nivel">
                Nivel
              </label>
              <select
                id="ev-nivel"
                value={nivel}
                onChange={(e) => setNivel(e.target.value)}
                style={campo}
              >
                {/* Vacío = todos: en el Welcome, lo agenda un niño de cualquier nivel. */}
                <option value="">Todos los niveles</option>
                {NIVELES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-limite">
                Límite de usuarios {esWelcome ? "*" : ""}
              </label>
              <input
                id="ev-limite"
                type="number"
                min={1}
                max={200}
                value={limite}
                placeholder={
                  esAdmin
                    ? String(LIMITE_ADMIN_DEFECTO)
                    : esWelcome
                      ? "cuántos niños caben"
                      : (salonesFiltrados.find((s) => s.id === salonPrincipal)?.cupo.toString() ??
                        "cupo del salón")
                }
                onChange={(e) => setLimite(e.target.value)}
                style={campo}
              />
            </div>
            <div>
              <label style={rotulo} htmlFor="ev-guia">
                Guía {esAdmin ? "(sala de Zoom)" : "*"}
              </label>
              <select
                id="ev-guia"
                value={guiaUserId}
                onChange={(e) => setGuiaUserId(e.target.value)}
                style={campo}
              >
                <option value="">Seleccionar guía</option>
                {guias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tanda de clubs: el Club se repite cada semana entre estas fechas. */}
          {esTanda && (
            <div
              style={{
                padding: "0.8rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #c5e1a5",
                background: "#f6fbef",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}
                className="ev-dos"
              >
                <div>
                  <label style={rotulo} htmlFor="ev-tanda-inicio">
                    Inicio tanda de Clubs *
                  </label>
                  <input
                    id="ev-tanda-inicio"
                    type="date"
                    value={tandaInicio}
                    onChange={(e) => setTandaInicio(e.target.value)}
                    style={campo}
                  />
                </div>
                <div>
                  <label style={rotulo} htmlFor="ev-tanda-fin">
                    Final de tanda de clubs *
                  </label>
                  <input
                    id="ev-tanda-fin"
                    type="date"
                    value={tandaFin}
                    onChange={(e) => setTandaFin(e.target.value)}
                    style={campo}
                  />
                </div>
              </div>
              <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)", lineHeight: 1.45 }}>
                El Club se repite cada{" "}
                <strong>
                  {fecha !== "" ? DIAS_SEMANA[new Date(`${fecha}T12:00:00`).getDay()] : "semana"}
                </strong>{" "}
                a las {hora} entre estas fechas; los feriados de cada salón y las fechas ya pasadas
                se saltan.
                {tandaDe !== "" &&
                  ` Por defecto, el inicio y el fin de los cursos de ${tandaDe}; se pueden cambiar.`}
              </span>
            </div>
          )}

          {/* Editando un Club de una tanda: esa sesión o toda la tanda. */}
          {tandaEditada !== null && (
            <div
              style={{
                padding: "0.7rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #c5e1a5",
                background: "#f6fbef",
                fontSize: "0.85rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
              }}
            >
              <span>
                Club de una <strong>tanda</strong> del {tandaEditada.inicio} al {tandaEditada.fin}.
              </span>
              <label style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                <input
                  type="radio"
                  name="alcance-tanda"
                  checked={!todaLaTanda}
                  onChange={() => setTodaLaTanda(false)}
                />
                Solo esta sesión
              </label>
              <label style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                <input
                  type="radio"
                  name="alcance-tanda"
                  checked={todaLaTanda}
                  onChange={() => setTodaLaTanda(true)}
                />
                Toda la tanda ({tandaEditada.futuras} sesión
                {tandaEditada.futuras === 1 ? "" : "es"} por delante; las ya dictadas no cambian)
              </label>
              {todaLaTanda && (
                <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                  Si cambias la fecha, todas las semanas se corren los mismos días.
                </span>
              )}
            </div>
          )}

          {/* Club: "Link diferente al del Advisor", de la tabla Links de Clubes y
              solo los del día de la semana de la fecha. */}
          {esClub && (
            <div
              style={{
                padding: "0.7rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #c5cae9",
                background: "#f5f6ff",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <label
                style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 700 }}
              >
                <input
                  type="checkbox"
                  checked={linkPropio}
                  onChange={(e) => setLinkPropio(e.target.checked)}
                />
                Link diferente al del Advisor
              </label>
              {linkPropio && (
                <>
                  <select
                    aria-label="Link del Club"
                    value={linkElegido?.id ?? ""}
                    onChange={(e) => setLinkClubId(e.target.value)}
                    style={campo}
                  >
                    <option value="">
                      {linksDelDia.length === 0
                        ? `No hay links para los ${diaFecha >= 0 ? (DIAS_SEMANA[diaFecha] ?? "") : "—"}`
                        : "Seleccionar link"}
                    </option>
                    {linksDelDia.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre} · {l.horario}
                        {l.activo ? "" : " (desactivado: se conserva en este Club)"}
                      </option>
                    ))}
                  </select>
                  <span
                    style={{ fontSize: "0.78rem", color: "var(--texto-suave)", lineHeight: 1.45 }}
                  >
                    {linkElegido !== null ? (
                      <>
                        Enlace:{" "}
                        <strong style={{ wordBreak: "break-all" }}>{linkElegido.link}</strong>
                      </>
                    ) : (
                      <>
                        Se ofrecen los links de los{" "}
                        <strong>{diaFecha >= 0 ? DIAS_SEMANA[diaFecha] : "—"}</strong> (el día de la
                        fecha del Club). Se cargan en Sesiones › Links de Clubes.
                      </>
                    )}
                  </span>
                </>
              )}
            </div>
          )}

          {/* El Zoom no se escribe: se hereda del guía (o del link del Club). */}
          <div
            style={{
              padding: "0.6rem 0.8rem",
              borderRadius: "0.6rem",
              background: "#fafbfe",
              fontSize: "0.85rem",
              ...(usaLinkClub && { opacity: 0.45, textDecoration: "line-through" }),
            }}
            aria-disabled={usaLinkClub}
          >
            <span style={{ fontWeight: 700 }}>🔗 Link de Zoom del advisor:</span>{" "}
            {usaLinkClub ? (
              <span>no se usa: el Club va con su propio link</span>
            ) : guia === null ? (
              <span style={{ color: "var(--texto-suave)" }}>elige un guía para verlo</span>
            ) : guia.zoomUrl !== null && guia.zoomUrl !== "" ? (
              <span>{guia.zoomUrl}</span>
            ) : (
              <span style={{ color: "#b57a00" }}>
                {guia.nombre} todavía no tiene sala configurada. El evento se crea igual, pero sin
                enlace.
              </span>
            )}
            <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)", marginTop: "0.2rem" }}>
              Se toma de la ficha del guía, no se escribe aquí.
            </div>
          </div>

          {todosLosSalones && (
            <div
              style={{
                padding: "0.7rem 0.9rem",
                borderRadius: "0.6rem",
                background: "#e3f2fd",
                border: "1px solid #90caf9",
                fontSize: "0.83rem",
                lineHeight: 1.45,
              }}
            >
              <strong>🏫 Todos los salones.</strong>{" "}
              {salonesFiltrados.length === 0
                ? "Ningún salón coincide con esa campaña, país y curso."
                : tipo === "CLUB"
                  ? `Se crea como UN solo Club (misma hora, guía y Zoom) para los ${String(salonesFiltrados.length)} salón${salonesFiltrados.length === 1 ? "" : "es"} de esa campaña, país y curso que estén activos: sus niños lo ven en "Inscripción Clubes" y entran a la lista al inscribirse.`
                  : `Se crea como UNA sola clase (misma hora, guía y Zoom) en los ${String(salonesFiltrados.length)} salón${salonesFiltrados.length === 1 ? "" : "es"} de esa campaña, país y curso que estén activos; cada uno la ve en su lista.`}{" "}
              La hora va en {relojHora}: cada salón la ve en su propia hora. Si algún salón ya tiene
              un evento a esa hora, no se crea y se dice cuál.
            </div>
          )}

          {esWelcome && (
            <div
              style={{
                padding: "0.7rem 0.9rem",
                borderRadius: "0.6rem",
                background: "#e8f5e9",
                border: "1px solid #a5d6a7",
                fontSize: "0.83rem",
                lineHeight: 1.45,
              }}
            >
              <strong>👋 Welcome.</strong> La hora va en {relojHora}; cada niño la verá en su propia
              hora. Lo agendan los niños {nivel === "" ? "de cualquier nivel" : `de nivel ${nivel}`}{" "}
              al crear su perfil (o coordinación desde su ficha). Campaña, país, curso, salón y
              nivel vacíos = todos.
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.45rem",
                  marginTop: "0.5rem",
                  fontWeight: 700,
                }}
              >
                <input
                  type="checkbox"
                  checked={enMarcha}
                  onChange={(e) => setEnMarcha(e.target.checked)}
                  style={{ marginTop: "0.2rem" }}
                />
                <span>
                  Para niños con el curso en marcha
                  <span style={{ display: "block", fontWeight: 400 }}>
                    {enMarcha
                      ? "No exige que sea antes del inicio del curso: es para quien entra con el curso ya andando."
                      : "Sin marcar, el Welcome tiene que ser antes del inicio del curso."}
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* Abierto a otros salones: lo agenda coordinación desde la ficha del
              niño (Academic management › Agendar), si coincide con el alcance. */}
          {!esAdmin && !esWelcome && tipo !== "CLUB" && (
            <div
              style={{
                padding: "0.8rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #e3e7f0",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              <label
                style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 700 }}
              >
                <input
                  type="checkbox"
                  checked={apertura.abierto}
                  onChange={(e) => setApertura({ ...apertura, abierto: e.target.checked })}
                />
                Abierto a niños de otros salones (se inscriben en su panel o desde su ficha)
              </label>
              {apertura.abierto && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
                    gap: "0.6rem",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      fontSize: "0.82rem",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>Campaña</span>
                    <select
                      value={apertura.campaignId ?? ""}
                      onChange={(e) =>
                        setApertura({
                          ...apertura,
                          campaignId: e.target.value === "" ? null : e.target.value,
                          classroomId: null,
                        })
                      }
                      style={campo}
                    >
                      <option value="">Todas</option>
                      {campaniasLista.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      fontSize: "0.82rem",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>Curso</span>
                    <select
                      value={apertura.curso ?? ""}
                      onChange={(e) =>
                        setApertura({
                          ...apertura,
                          curso:
                            e.target.value === "JUNIOR" || e.target.value === "YOUNGSTER"
                              ? e.target.value
                              : null,
                          classroomId: null,
                        })
                      }
                      style={campo}
                    >
                      <option value="">Todos</option>
                      <option value="JUNIOR">Junior</option>
                      <option value="YOUNGSTER">Youngster</option>
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      fontSize: "0.82rem",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>País</span>
                    <select
                      value={apertura.pais ?? ""}
                      onChange={(e) =>
                        setApertura({
                          ...apertura,
                          pais: PAISES_APERTURA.find(([c]) => c === e.target.value)?.[0] ?? null,
                        })
                      }
                      style={campo}
                    >
                      <option value="">Todos</option>
                      {PAISES_APERTURA.map(([c, n]) => (
                        <option key={c} value={c}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      fontSize: "0.82rem",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>Salón</span>
                    <select
                      value={apertura.classroomId ?? ""}
                      onChange={(e) =>
                        setApertura({
                          ...apertura,
                          classroomId: e.target.value === "" ? null : e.target.value,
                        })
                      }
                      style={campo}
                    >
                      <option value="">Todos</option>
                      {salones
                        .filter(
                          (s) =>
                            (apertura.campaignId === null ||
                              s.campania ===
                                campaniasLista.find((c) => c.id === apertura.campaignId)?.nombre) &&
                            (apertura.curso === null || s.curso === apertura.curso),
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Compartir entre cursos: solo tiene sentido en el evento académico
              de UN salón elegido (con "Todos" ya se comparte entre todos). */}
          {!esAdmin && !esWelcome && !salonFijo && !todosLosSalones && (
            <div
              style={{
                padding: "0.8rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #e3e7f0",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={compartir}
                  onChange={(e) => {
                    setCompartir(e.target.checked);
                    if (!e.target.checked) setExtras([]);
                  }}
                />
                Evento compartido entre cursos
              </label>
              <p
                style={{ fontSize: "0.78rem", color: "var(--texto-suave)", margin: "0.25rem 0 0" }}
              >
                La misma clase en hasta {MAX_COMPARTIDOS - 1} salones adicionales (misma hora, guía
                y Zoom). Para el guía cuenta como una sola hora.
              </p>
              {compartir && (
                <div
                  style={{
                    marginTop: "0.6rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.3rem",
                    maxHeight: "10rem",
                    overflowY: "auto",
                  }}
                >
                  {salonesCompartibles.length === 0 ? (
                    <span style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
                      Elige campaña y país para ver salones disponibles.
                    </span>
                  ) : (
                    salonesCompartibles.map((s) => {
                      const marcado = extras.includes(s.id);
                      const tope = extras.length >= MAX_COMPARTIDOS - 1;
                      return (
                        <label
                          key={s.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.45rem",
                            fontSize: "0.85rem",
                            opacity: !marcado && tope ? 0.5 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={!marcado && tope}
                            onChange={(e) => {
                              setExtras((prev) =>
                                e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                              );
                            }}
                          />
                          {s.curso} · {s.nombre}
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* Audiencia: quiénes verán el evento en su calendario. */}
          {esAdmin && (
            <div
              style={{
                padding: "0.8rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #e3e7f0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                  Guías que verán este evento * ({audiencia.length}/{guias.length})
                </span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    type="button"
                    style={{ ...boton, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                    onClick={() => setAudiencia(guias.map((g) => g.id))}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    style={{ ...boton, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                    onClick={() => setAudiencia([])}
                  >
                    Ninguno
                  </button>
                </div>
              </div>
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "var(--texto-suave)",
                  margin: "0.25rem 0 0.5rem",
                }}
              >
                Solo los seleccionados lo verán en su calendario. Sin ninguno, el evento no se puede
                crear.
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                  maxHeight: "12rem",
                  overflowY: "auto",
                }}
              >
                {guias.length === 0 ? (
                  <span style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
                    No hay guías activos.
                  </span>
                ) : (
                  guias.map((g) => (
                    <label
                      key={g.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={audiencia.includes(g.id)}
                        onChange={(e) => {
                          setAudiencia((prev) =>
                            e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id),
                          );
                        }}
                      />
                      {g.nombre}
                      {(g.zoomUrl === null || g.zoomUrl === "") && (
                        <span style={{ fontSize: "0.72rem", color: "#b57a00" }}>· sin Zoom</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div>
            <label style={rotulo} htmlFor="ev-obs">
              Observaciones
            </label>
            <textarea
              id="ev-obs"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas adicionales sobre el evento"
              style={campo}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
              borderTop: "1px solid #eef1f7",
              paddingTop: "0.9rem",
            }}
          >
            <button type="button" onClick={onCerrar} style={boton} disabled={ocupado}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void crear()}
              disabled={ocupado || !listo}
              style={{
                ...boton,
                border: "none",
                background: listo ? "var(--lgs-purpura)" : "#c9c6d8",
                color: "white",
              }}
            >
              {ocupado
                ? editar !== undefined
                  ? "Guardando…"
                  : "Creando…"
                : editar !== undefined
                  ? "Guardar cambios"
                  : esAdmin
                    ? `Crear evento (${String(audiencia.length)} guías)`
                    : `Crear evento${seleccionados.length > 1 ? ` (${String(seleccionados.length)} salones)` : ""}`}
            </button>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 760px) { .ev-dos, .ev-tres { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
