"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { apiFetch } from "@/ui/api-fetch";
import { SesionModal } from "./SesionModal";
import { NuevoEventoModal } from "./NuevoEventoModal";

interface Salon {
  id: string;
  nombre: string;
  curso: string;
  campania: string;
  campaniaInicio: string;
  guia: string | null;
  horario: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
  cupo: number;
  timezone: string;
  holidayCountry: string;
  sesiones: number;
  primeraSesion: string | null;
  ultimaSesion: string | null;
}

interface CampaniaLista {
  id: string;
  nombre: string;
  estado: string;
}

interface CursoDetalle {
  id: string;
  tipo: string;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ZONAS = ["America/Santiago", "America/Bogota", "America/Guayaquil", "America/Lima"];
const PAISES = ["CL", "CO", "EC", "PE"];

const inputStyle: CSSProperties = {
  padding: "0.5rem 0.65rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.9rem",
};

interface SlotForm {
  tipo: "SESION" | "CLUB";
  diaSemana: number;
  horaLocal: string;
  duracionMin?: number;
}

interface HorarioCat {
  id: string;
  tipoCurso: string;
  etiqueta: string;
  slots: { tipo: "SESION" | "CLUB"; diaSemana: number; horaLocal: string; duracionMin: number }[];
}

interface EventoAdmin {
  id: string;
  tipo: string;
  titulo: string | null;
  fecha: string;
  startsAt: string;
  duracionMin: number;
  observaciones: string | null;
  guias: number;
}

interface AgendaSesion {
  id: string;
  fecha: string;
  horaLocal: string;
  tipo: string;
  numero: number;
  classroomId: string;
  salon: string;
  cursoTipo: string;
  campania: string;
  cupo: number;
  ocupados: number;
  guia: string | null;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
/** Índice = diaSemana de `scheduling_slot` (0 = domingo). */
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const COLOR_CURSO: Record<string, { bg: string; fg: string }> = {
  JUNIOR: { bg: "#e3f2fd", fg: "#0d47a1" },
  YOUNGSTER: { bg: "#f3e5f5", fg: "#6a1b9a" },
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const CELDA_ALTO = "6.5rem";
const MAX_VISIBLE = 2;

/** "2026-07-08" → "miércoles, 8 de julio de 2026". */
function fechaBonita(iso: string): string {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const [yy, mm, dd] = iso.split("-").map(Number);
  const f = new Date(yy ?? 0, (mm ?? 1) - 1, dd ?? 1);
  return `${dias[f.getDay()]}, ${dd} de ${MESES[(mm ?? 1) - 1]} de ${yy}`;
}

/** Calendario mensual con las sesiones de TODOS los salones. */
function CalendarioSalones() {
  const [y, setY] = useState<number>(() => new Date().getFullYear());
  const [m, setM] = useState<number>(() => new Date().getMonth()); // 0-based
  const [sesiones, setSesiones] = useState<AgendaSesion[] | null>(null);
  // Eventos administrativos: se pintan en NARANJA, mezclados con las sesiones.
  const [eventosAdmin, setEventosAdmin] = useState<EventoAdmin[]>([]);
  const [campanias, setCampanias] = useState<{ id: string; nombre: string }[]>([]);
  const [campaniaId, setCampaniaId] = useState("");
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  // Evento abierto en MODAL: antes se navegaba a una página aparte.
  const [sesionAbierta, setSesionAbierta] = useState<string | null>(null);
  const [puedeGestionarSalones, setPuedeGestionarSalones] = useState(false);

  useEffect(() => {
    async function permisos() {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const me = (await res.json()) as { permisos: { code: string }[] };
      setPuedeGestionarSalones(me.permisos.some((p) => p.code === "salones.gestionar"));
    }
    void permisos();
  }, []);

  useEffect(() => {
    async function cargarCampanias() {
      const res = await apiFetch("/api/catalog/campaigns");
      if (res.ok) {
        const data: { campanias: { id: string; nombre: string }[] } = await res.json();
        setCampanias(data.campanias);
      }
    }
    void cargarCampanias();
  }, []);

  useEffect(() => {
    async function cargar() {
      setSesiones(null);
      const diasMes = new Date(y, m + 1, 0).getDate();
      const from = `${y}-${pad2(m + 1)}-01`;
      const to = `${y}-${pad2(m + 1)}-${pad2(diasMes)}`;
      const filtro = campaniaId !== "" ? `&campaignId=${campaniaId}` : "";
      const [res, resAdmin] = await Promise.all([
        apiFetch(`/api/scheduling/agenda?from=${from}&to=${to}${filtro}`),
        apiFetch(`/api/scheduling/eventos-admin?from=${from}&to=${to}`),
      ]);
      if (res.ok) {
        const data: { sesiones: AgendaSesion[] } = await res.json();
        setSesiones(data.sesiones);
      } else {
        setSesiones([]);
      }
      // El endpoint ya acota por audiencia: un guía solo recibe los suyos.
      setEventosAdmin(
        resAdmin.ok ? ((await resAdmin.json()) as { eventos: EventoAdmin[] }).eventos : [],
      );
    }
    void cargar();
  }, [y, m, campaniaId]);

  const adminPorDia = useMemo(() => {
    const mapa = new Map<string, EventoAdmin[]>();
    for (const e of eventosAdmin) {
      const lista = mapa.get(e.fecha) ?? [];
      lista.push(e);
      mapa.set(e.fecha, lista);
    }
    return mapa;
  }, [eventosAdmin]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, AgendaSesion[]>();
    for (const s of sesiones ?? []) {
      const lista = mapa.get(s.fecha) ?? [];
      lista.push(s);
      mapa.set(s.fecha, lista);
    }
    return mapa;
  }, [sesiones]);

  const diasMes = new Date(y, m + 1, 0).getDate();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // lunes primero
  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: diasMes }, (_, i) => i + 1),
  ];
  while (celdas.length % 7 !== 0) celdas.push(null);

  function mover(delta: number) {
    const nueva = m + delta;
    if (nueva < 0) {
      setM(11);
      setY((v) => v - 1);
    } else if (nueva > 11) {
      setM(0);
      setY((v) => v + 1);
    } else {
      setM(nueva);
    }
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1.2rem", margin: 0, textTransform: "capitalize" }}>
          {MESES[m]} {y}
        </h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            value={campaniaId}
            onChange={(e) => setCampaniaId(e.target.value)}
            style={{ ...inputStyle, padding: "0.4rem 0.6rem" }}
          >
            <option value="">Todas las campañas</option>
            {campanias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => mover(-1)}
            aria-label="Mes anterior"
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => mover(1)}
            aria-label="Mes siguiente"
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            ›
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px" }}>
        {DOW.map((d) => (
          <div
            key={d}
            style={{
              padding: "0.4rem",
              fontSize: "0.78rem",
              fontWeight: 700,
              color: "var(--texto-suave)",
              textAlign: "center",
            }}
          >
            {d}
          </div>
        ))}
        {celdas.map((dia, i) => {
          if (dia === null) {
            return (
              <div
                key={`v${i}`}
                style={{ height: CELDA_ALTO, background: "#fafbfe", borderRadius: "0.4rem" }}
              />
            );
          }
          const fecha = `${y}-${pad2(m + 1)}-${pad2(dia)}`;
          const delDia = (porDia.get(fecha) ?? []).sort((a, b) =>
            a.horaLocal.localeCompare(b.horaLocal),
          );
          const adminDelDia = adminPorDia.get(fecha) ?? [];
          // Los administrativos van PRIMERO y no compiten por el cupo visible:
          // son pocos y afectan al equipo, así que no deben quedar bajo "+N más".
          const visibles = delDia.slice(0, Math.max(0, MAX_VISIBLE - adminDelDia.length));
          const ocultos = delDia.length - visibles.length;
          return (
            <div
              key={fecha}
              style={{
                height: CELDA_ALTO,
                border: "1px solid #edf0f6",
                borderRadius: "0.4rem",
                padding: "0.3rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => delDia.length > 0 && setDiaAbierto(fecha)}
                title={delDia.length > 0 ? "Ver sesiones del día" : undefined}
                style={{
                  alignSelf: "flex-start",
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "var(--texto-suave)",
                  cursor: delDia.length > 0 ? "pointer" : "default",
                }}
              >
                {dia}
              </button>
              {adminDelDia.map((e) => (
                <div
                  key={e.id}
                  title={`${e.titulo ?? "Evento administrativo"} · ${String(e.guias)} guías${e.observaciones !== null ? ` · ${e.observaciones}` : ""}`}
                  style={{
                    background: "#fff3e0",
                    color: "#e65100",
                    border: "1px solid #ffcc80",
                    borderRadius: "0.35rem",
                    padding: "0.15rem 0.35rem",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  🏛️{" "}
                  {new Date(e.startsAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  {e.titulo ?? "Administrativo"}
                </div>
              ))}
              {visibles.map((s) => {
                const color = COLOR_CURSO[s.cursoTipo] ?? { bg: "#eceff1", fg: "#37474f" };
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSesionAbierta(s.id)}
                    title={`${s.horaLocal} · ${s.cursoTipo} · ${s.salon} · ${s.ocupados}/${s.cupo}`}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      font: "inherit",
                      cursor: "pointer",
                      display: "block",
                      background: color.bg,
                      color: color.fg,
                      borderRadius: "0.35rem",
                      padding: "0.15rem 0.35rem",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.horaLocal} {s.tipo === "CLUB" ? "Club " : ""}
                    {s.cursoTipo === "JUNIOR" ? "Jr" : "Yg"} · {s.salon}
                  </button>
                );
              })}
              {ocultos > 0 && (
                <button
                  type="button"
                  onClick={() => setDiaAbierto(fecha)}
                  style={{
                    alignSelf: "flex-start",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    color: "var(--lgs-azul)",
                    cursor: "pointer",
                  }}
                >
                  +{ocultos} más
                </button>
              )}
            </div>
          );
        })}
      </div>

      {sesiones === null && (
        <p style={{ marginTop: "0.75rem", color: "var(--texto-suave)" }}>Cargando agenda…</p>
      )}

      {diaAbierto !== null && (
        <div
          onClick={() => setDiaAbierto(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "0.9rem",
              padding: "1.25rem",
              width: "100%",
              maxWidth: "34rem",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                marginBottom: "0.75rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.05rem", textTransform: "capitalize" }}>
                {fechaBonita(diaAbierto)}
              </h3>
              <button
                type="button"
                onClick={() => setDiaAbierto(null)}
                aria-label="Cerrar"
                style={{ ...inputStyle, cursor: "pointer", padding: "0.3rem 0.6rem" }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: "0 0 0.75rem", color: "var(--texto-suave)", fontSize: "0.85rem" }}>
              {(porDia.get(diaAbierto) ?? []).length} sesiones
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {(porDia.get(diaAbierto) ?? [])
                .slice()
                .sort((a, b) => a.horaLocal.localeCompare(b.horaLocal))
                .map((s) => {
                  const color = COLOR_CURSO[s.cursoTipo] ?? { bg: "#eceff1", fg: "#37474f" };
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => {
                        setDiaAbierto(null);
                        setSesionAbierta(s.id);
                      }}
                      style={{
                        width: "100%",
                        font: "inherit",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.6rem",
                        padding: "0.55rem 0.75rem",
                        border: "1px solid #edf0f6",
                        borderRadius: "0.6rem",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <span>
                        <strong>{s.horaLocal}</strong>{" "}
                        <span
                          style={{
                            background: color.bg,
                            color: color.fg,
                            padding: "0.1rem 0.45rem",
                            borderRadius: "0.5rem",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                          }}
                        >
                          {s.cursoTipo === "JUNIOR" ? "Junior" : "Youngster"}
                        </span>{" "}
                        {s.tipo === "CLUB" ? "Club · " : ""}
                        {s.salon}
                        {s.guia !== null && (
                          <span style={{ color: "var(--texto-suave)", fontSize: "0.8rem" }}>
                            {" "}
                            · {s.guia}
                          </span>
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--texto-suave)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.ocupados}/{s.cupo} →
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Evento en MODAL: reemplaza la navegación a /calendario/sesion/[id],
          que sigue viva como enlace profundo. */}
      {sesionAbierta !== null && (
        <SesionModal
          sessionId={sesionAbierta}
          puedeGestionarSalones={puedeGestionarSalones}
          onCerrar={() => setSesionAbierta(null)}
        />
      )}
    </div>
  );
}

export default function SalonesPage() {
  const [salones, setSalones] = useState<Salon[] | null>(null);
  const [campanias, setCampanias] = useState<CampaniaLista[]>([]);
  const [cursos, setCursos] = useState<CursoDetalle[]>([]);
  const [campaniaId, setCampaniaId] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [nombre, setNombre] = useState("");
  const [cupo, setCupo] = useState("12");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [timezone, setTimezone] = useState("America/Santiago");
  const [pais, setPais] = useState("CL");
  const [slots, setSlots] = useState<SlotForm[]>([
    { tipo: "SESION", diaSemana: 2, horaLocal: "18:00" },
    { tipo: "SESION", diaSemana: 4, horaLocal: "18:00" },
    { tipo: "CLUB", diaSemana: 6, horaLocal: "10:00" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<"calendario" | "lista">("calendario");
  // Crear eventos tiene permiso PROPIO: no basta con ver el calendario.
  const [puedeCrearEventos, setPuedeCrearEventos] = useState(false);
  // Crear salones es de coordinación: el guía no debe ver el botón.
  const [puedeGestionarSalonesPagina, setPuedeGestionarSalonesPagina] = useState(false);
  const [nuevoEvento, setNuevoEvento] = useState<"academico" | "administrativo" | null>(null);

  useEffect(() => {
    async function permisos() {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const me = (await res.json()) as { permisos: { code: string }[] };
      setPuedeCrearEventos(me.permisos.some((p) => p.code === "eventos.crear"));
      setPuedeGestionarSalonesPagina(me.permisos.some((p) => p.code === "salones.gestionar"));
    }
    void permisos();
  }, []);
  const [horariosCat, setHorariosCat] = useState<HorarioCat[]>([]);

  const cargarSalones = useCallback(async () => {
    const res = await apiFetch("/api/scheduling/classrooms");
    if (res.ok) {
      const data: { salones: Salon[] } = await res.json();
      setSalones(data.salones);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargarSalones();
      const res = await apiFetch("/api/catalog/campaigns");
      if (res.ok) {
        const data: { campanias: CampaniaLista[] } = await res.json();
        setCampanias(data.campanias);
      }
      const resH = await apiFetch("/api/scheduling/horarios?activos=1");
      if (resH.ok) {
        const dataH: { horarios: HorarioCat[] } = await resH.json();
        setHorariosCat(dataH.horarios);
      }
    }
    void inicial();
  }, [cargarSalones]);

  const tipoCursoSel = cursos.find((c) => c.id === courseId)?.tipo;
  const horariosDelTipo = horariosCat.filter((h) => h.tipoCurso === tipoCursoSel);

  function cargarHorarioCatalogo(horarioId: string) {
    const h = horariosCat.find((x) => x.id === horarioId);
    if (h === undefined) return;
    setSlots(
      h.slots.map((s) => ({
        tipo: s.tipo,
        diaSemana: s.diaSemana,
        horaLocal: s.horaLocal,
        duracionMin: s.duracionMin,
      })),
    );
  }

  async function elegirCampania(id: string) {
    setCampaniaId(id);
    setCourseId("");
    if (id === "") {
      setCursos([]);
      return;
    }
    const res = await apiFetch(`/api/catalog/campaigns/${id}`);
    if (res.ok) {
      const data: { campania: { courses: CursoDetalle[] } } = await res.json();
      setCursos(data.campania.courses);
    }
  }

  async function crear(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch("/api/scheduling/classrooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          nombre,
          cupo: Number(cupo),
          meetingUrl: meetingUrl || null,
          timezone,
          holidayCountry: pais,
          slots,
        }),
      });
      const data: { sesionesGeneradas?: number; error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo crear el salón.");
        return;
      }
      setMostrarForm(false);
      setNombre("");
      await cargarSalones();
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  function setSlot(index: number, patch: Partial<SlotForm>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.6rem" }}>Calendario</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              border: "1.5px solid #d8dce6",
              borderRadius: "0.6rem",
              overflow: "hidden",
            }}
          >
            {(["calendario", "lista"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                style={{
                  padding: "0.5rem 1rem",
                  border: "none",
                  background: vista === v ? "var(--lgs-azul)" : "white",
                  color: vista === v ? "white" : "inherit",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {v === "calendario" ? "📅 Calendario" : "Lista de salones"}
              </button>
            ))}
          </div>
          {puedeCrearEventos && (
            <>
              <button
                onClick={() => setNuevoEvento("academico")}
                style={{
                  padding: "0.55rem 1.2rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "var(--lgs-purpura)",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + Evento académico
              </button>
              <button
                onClick={() => setNuevoEvento("administrativo")}
                style={{
                  padding: "0.55rem 1.2rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "var(--lgs-cian)",
                  color: "#08343f",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + Evento administrativo
              </button>
            </>
          )}
          {vista === "lista" && puedeGestionarSalonesPagina && (
            <button
              onClick={() => setMostrarForm((v) => !v)}
              style={{
                padding: "0.55rem 1.2rem",
                borderRadius: "0.6rem",
                border: "none",
                background: "var(--lgs-verde)",
                color: "#1b2a10",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {mostrarForm ? "Cancelar" : "+ Nuevo salón"}
            </button>
          )}
        </div>
      </div>

      {vista === "calendario" && <CalendarioSalones />}

      {vista === "lista" && mostrarForm && (
        <form
          onSubmit={crear}
          style={{
            marginTop: "1rem",
            padding: "1.25rem",
            border: "1px solid #e3e7f0",
            borderRadius: "0.9rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 12rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Campaña</span>
              <select
                required
                value={campaniaId}
                onChange={(e) => void elegirCampania(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Elegir —</option>
                {campanias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 10rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Curso</span>
              <select
                required
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Elegir —</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tipo}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "1 1 10rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Nombre del salón</span>
              <input
                required
                minLength={2}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Rookie A"
                style={inputStyle}
              />
            </label>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", width: "5rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Cupo</span>
              <input
                type="number"
                min={1}
                max={50}
                required
                value={cupo}
                onChange={(e) => setCupo(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <label
              style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: "2 1 16rem" }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                Enlace de reunión (clases virtuales)
              </span>
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet…"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Zona operativa</span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={inputStyle}
              >
                {ZONAS.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Calendario feriados</span>
              <select value={pais} onChange={(e) => setPais(e.target.value)} style={inputStyle}>
                {PAISES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset
            style={{ border: "1px dashed #cfd6e4", borderRadius: "0.7rem", padding: "0.9rem" }}
          >
            <legend style={{ fontWeight: 700, fontSize: "0.9rem", padding: "0 0.4rem" }}>
              Horario semanal (hora local del salón)
            </legend>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "0.7rem",
              }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--texto-suave)" }}>
                Cargar del catálogo:
              </span>
              <select
                value=""
                onChange={(e) => cargarHorarioCatalogo(e.target.value)}
                disabled={courseId === "" || horariosDelTipo.length === 0}
                title={
                  courseId === ""
                    ? "Elige primero el curso"
                    : horariosDelTipo.length === 0
                      ? "No hay horarios en el catálogo para este curso"
                      : undefined
                }
                style={{ ...inputStyle, padding: "0.4rem 0.6rem" }}
              >
                <option value="">
                  {courseId === ""
                    ? "— elige curso primero —"
                    : horariosDelTipo.length === 0
                      ? "— sin horarios en catálogo —"
                      : "— elegir horario —"}
                </option>
                {horariosDelTipo.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.etiqueta}
                  </option>
                ))}
              </select>
              <Link href="/panel/horarios" style={{ fontSize: "0.78rem" }}>
                gestionar horarios →
              </Link>
            </div>
            {slots.map((slot, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  marginBottom: "0.4rem",
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={slot.tipo}
                  onChange={(e) => setSlot(i, { tipo: e.target.value as SlotForm["tipo"] })}
                  style={inputStyle}
                >
                  <option value="SESION">Sesión</option>
                  <option value="CLUB">Club</option>
                </select>
                <select
                  value={slot.diaSemana}
                  onChange={(e) => setSlot(i, { diaSemana: Number(e.target.value) })}
                  style={inputStyle}
                >
                  {DIAS.map((d, idx) => (
                    <option key={d} value={idx}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={slot.horaLocal}
                  onChange={(e) => setSlot(i, { horaLocal: e.target.value })}
                  required
                  style={inputStyle}
                />
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {slots.length < 4 && (
              <button
                type="button"
                onClick={() =>
                  setSlots((prev) => [
                    ...prev,
                    { tipo: "SESION", diaSemana: 1, horaLocal: "18:00" },
                  ])
                }
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                + Agregar bloque
              </button>
            )}
          </fieldset>

          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontSize: "0.9rem" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={ocupado}
            style={{
              alignSelf: "flex-start",
              padding: "0.65rem 1.5rem",
              borderRadius: "0.7rem",
              border: "none",
              background: ocupado ? "#9e9e9e" : "var(--lgs-verde)",
              color: "#1b2a10",
              fontWeight: 700,
              cursor: ocupado ? "wait" : "pointer",
            }}
          >
            {ocupado ? "Generando sesiones…" : "Crear salón y generar sesiones"}
          </button>
          <p style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
            Se generarán TODAS las sesiones del curso: los feriados del calendario elegido no se
            dictan y la sesión se corre al final, conservando el total.
          </p>
        </form>
      )}

      {nuevoEvento !== null && salones !== null && (
        <NuevoEventoModal
          salones={salones}
          modo={nuevoEvento}
          onCerrar={() => setNuevoEvento(null)}
          onCreado={() => {
            setNuevoEvento(null);
            void cargarSalones();
          }}
        />
      )}

      {vista === "lista" && (
        <section
          style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          {salones === null ? (
            <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
          ) : salones.length === 0 ? (
            <p style={{ color: "var(--texto-suave)" }}>
              Sin salones. Necesitas una campaña creada (sección Campañas) para colgar el salón de
              su curso.
            </p>
          ) : (
            (() => {
              // El servidor ya viene ordenado por campaña más reciente primero;
              // aquí solo se cortan los grupos, sin reordenar.
              const grupos: { campania: string; inicio: string; items: Salon[] }[] = [];
              for (const s of salones) {
                const ultimo = grupos[grupos.length - 1];
                if (ultimo !== undefined && ultimo.campania === s.campania) ultimo.items.push(s);
                else grupos.push({ campania: s.campania, inicio: s.campaniaInicio, items: [s] });
              }
              return grupos.map((g) => (
                <div
                  key={g.campania}
                  style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "0.5rem",
                      marginTop: "0.4rem",
                    }}
                  >
                    <h2 style={{ fontSize: "0.95rem", fontWeight: 800 }}>{g.campania}</h2>
                    <span style={{ fontSize: "0.76rem", color: "var(--texto-suave)" }}>
                      desde{" "}
                      {new Date(`${g.inicio}T12:00:00`).toLocaleDateString("es", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {" · "}
                      {g.items.length} {g.items.length === 1 ? "salón" : "salones"}
                    </span>
                  </div>
                  {g.items.map((s) => (
                    <Link
                      key={s.id}
                      href={`/panel/calendario/${s.id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.85rem 1rem",
                        border: "1px solid #e3e7f0",
                        borderRadius: "0.7rem",
                        color: "inherit",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <div>
                        {/* Título: Curso · País · Salón */}
                        <strong>
                          {s.curso} · {s.holidayCountry} · {s.nombre}
                        </strong>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--texto-suave)",
                            marginTop: "0.15rem",
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>Horario:</span>{" "}
                          {s.horario.length === 0
                            ? "sin horario"
                            : s.horario
                                .map(
                                  (h) =>
                                    `${DIAS_CORTOS[h.diaSemana] ?? "?"} ${h.horaLocal}${h.tipo === "CLUB" ? " (club)" : ""}`,
                                )
                                .join(" · ")}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                          <span style={{ fontWeight: 700 }}>Inicio:</span> {s.primeraSesion ?? "—"}
                          {"  "}
                          <span style={{ fontWeight: 700 }}>Final:</span> {s.ultimaSesion ?? "—"}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                          <span style={{ fontWeight: 700 }}>Advisor:</span>{" "}
                          {s.guia ?? <em>sin asignar</em>}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          padding: "0.22rem 0.6rem",
                          borderRadius: "1rem",
                          background: "#e3f2fd",
                          color: "#0d47a1",
                        }}
                      >
                        {s.sesiones} sesiones
                      </span>
                    </Link>
                  ))}
                </div>
              ));
            })()
          )}
        </section>
      )}
    </main>
  );
}
