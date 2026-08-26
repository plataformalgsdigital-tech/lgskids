"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { estadoZoom } from "@/ui/zoom-window";
import { ZoomAccessButton } from "@/ui/ZoomAccessButton";

interface Dashboard {
  alumno: { nombre: string } | null;
  matricula: {
    salon: string;
    campania: string;
    tipoCurso: string;
    guia: string | null;
    meetingUrl: string | null;
  } | null;
  asistencia?: {
    asistidas: number;
    ausentes: number;
    justificadas: number;
    totalSesiones: number;
  };
  proxima?: {
    sessionId: string;
    tipo: string;
    fecha: string;
    startsAt: string;
    duracionMin: number;
    guia: string | null;
  } | null;
  agenda?: {
    sessionId: string;
    tipo: string;
    fecha: string;
    startsAt: string;
    guia: string | null;
  }[];
  progreso?: {
    niveles: {
      levelId: string;
      codigo: string;
      nombre: string;
      orden: number;
      leccionesCompletadas: number;
      totalLecciones: number;
      levelUpAprobado: boolean;
      estado: "EN_CURSO" | "COMPLETADO" | "PENDIENTE";
      medalla: boolean;
    }[];
    diploma: boolean;
  };
  historial?: {
    sessionId: string;
    tipo: string;
    fecha: string;
    numero: number;
    estado: "PRESENTE" | "AUSENTE" | "JUSTIFICADO" | null;
  }[];
  imagenCursoUrl?: string | null;
  premios?: Record<string, string | null>; // premio por código de nivel (imagen)
  bannersNivel?: Record<string, string | null>; // mapa de isla por código de nivel
  mapaCursoUrl?: string | null; // mapa del curso completo
  voboUrl?: string | null; // sello VoBo
}

const COLOR_NIVEL: Record<string, string> = {
  ROOKIE: "var(--lgs-verde)",
  CHAMPION: "var(--lgs-cian)",
  ELITE: "var(--lgs-amarillo)",
  LEGENDARY: "var(--lgs-magenta)",
  ULTIMATE: "var(--lgs-purpura)",
};

// Premio al final del mapa de cada nivel (icono): sombreado hasta completar, vivo al completar.
const PREMIO_NIVEL: Record<string, string> = {
  ROOKIE: "🧭",
  CHAMPION: "🔑",
  ELITE: "👑",
  LEGENDARY: "⭐",
  ULTIMATE: "💰",
};

const DESC_CURSO: Record<string, { titulo: string; edad: string; desc: string }> = {
  JUNIOR: {
    titulo: "JUNIOR",
    edad: "6–9 años",
    desc: "Inglés en vivo con juegos, canciones y misiones para dar tus primeros pasos con confianza.",
  },
  YOUNGSTER: {
    titulo: "YOUNGSTER",
    edad: "10–13 años",
    desc: "Inglés en vivo con retos, conversación y proyectos para dominar el idioma paso a paso.",
  },
};

const card: CSSProperties = {
  background: "white",
  borderRadius: "1rem",
  padding: "1.25rem",
  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
};

// Ruta del logo de WhatsApp (relleno blanco sobre el círculo de color).
const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

// Canales de asistencia (WhatsApp). TODO: reemplazar `tel` por los números reales.
const SOPORTE: { label: string; tel: string; color: string; msg: string }[] = [
  { label: "Soporte Usuario", tel: "573000000000", color: "var(--lgs-azul)", msg: "Hola, necesito ayuda con mi cuenta de LGS Kids." },
  { label: "Soporte Académico", tel: "573000000000", color: "var(--lgs-verde)", msg: "Hola, tengo una duda académica de LGS Kids." },
  { label: "Finanzas", tel: "573000000000", color: "var(--lgs-magenta)", msg: "Hola, tengo una consulta de pagos de LGS Kids." },
];

// Barra de navegación bajo el encabezado (estilo MOSAICO). Los que tienen href
// hacen scroll a la sección de la página; el resto queda como acceso futuro.
const NAV_ITEMS: { label: string; emoji: string; href?: string; menu?: boolean; action?: "comovoy" | "historial" }[] = [
  { label: "Actividades", emoji: "✨", menu: true },
  { label: "Recursos", emoji: "🔗", menu: true },
  { label: "Material", emoji: "📖" },
  { label: "Historial", emoji: "📘", action: "historial" },
  { label: "Avance", emoji: "📈", href: "#avance" },
  { label: "¿Cómo voy?", emoji: "📊", action: "comovoy" },
  { label: "Instructivos", emoji: "🎥" },
  { label: "Perfil", emoji: "👤" },
];

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
}
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MiPanelPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [ingreso, setIngreso] = useState(false); // ya entró a la clase (reconexión)
  const [verImagen, setVerImagen] = useState(false); // lightbox del banner del curso
  const [verComoVoy, setVerComoVoy] = useState(false); // modal "¿Cómo voy?"
  const [verHistorial, setVerHistorial] = useState(false); // modal "Historial de clases"
  const [nivelesAbiertos, setNivelesAbiertos] = useState<Set<string>>(() => new Set()); // acordeón de niveles

  function toggleNivel(levelId: string) {
    setNivelesAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(levelId)) next.delete(levelId);
      else next.add(levelId);
      return next;
    });
  }

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Cerrar overlays (lightbox / modales) con la tecla Escape
  useEffect(() => {
    if (!verImagen && !verComoVoy && !verHistorial) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setVerImagen(false);
        setVerComoVoy(false);
        setVerHistorial(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [verImagen, verComoVoy, verHistorial]);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      let res = await fetch("/api/student/dashboard");
      if (res.status === 401) {
        const refresh = await fetch("/api/auth/refresh", { method: "POST" });
        if (!refresh.ok) {
          router.replace("/login");
          return;
        }
        res = await fetch("/api/student/dashboard");
      }
      if (res.status === 403) {
        router.replace("/panel");
        return;
      }
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      if (!cancelado) setData((await res.json()) as Dashboard);
    }
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [router]);

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const proxSessionId = data?.proxima?.sessionId ?? null;
  useEffect(() => {
    function sync() {
      try {
        setIngreso(proxSessionId !== null && localStorage.getItem(`zoom-acceso-${proxSessionId}`) === "1");
      } catch {
        setIngreso(false);
      }
    }
    sync();
  }, [proxSessionId]);

  function entrarZoom() {
    if (proxSessionId !== null) {
      try {
        localStorage.setItem(`zoom-acceso-${proxSessionId}`, "1");
      } catch {
        /* localStorage no disponible: la reconexión no persiste, no es crítico */
      }
    }
    setIngreso(true);
  }

  if (data === null) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--texto-suave)" }}>Cargando tu panel…</p>
      </main>
    );
  }

  const niveles = data.progreso?.niveles ?? [];
  const nivelActual = niveles.find((n) => n.estado === "EN_CURSO") ?? niveles.find((n) => n.estado !== "COMPLETADO");
  const ordenActual = nivelActual?.orden;
  const nivelAnterior = ordenActual !== undefined ? niveles.find((n) => n.orden === ordenActual - 1) : undefined;
  const nivelProximo = ordenActual !== undefined ? niveles.find((n) => n.orden === ordenActual + 1) : undefined;
  const totalLecc = niveles.reduce((a, n) => a + n.totalLecciones, 0);
  const compl = niveles.reduce((a, n) => a + n.leccionesCompletadas, 0);
  const leccionActual =
    nivelActual !== undefined ? Math.min(nivelActual.leccionesCompletadas + 1, nivelActual.totalLecciones) : null;

  const inicioProxima = data.proxima != null ? new Date(data.proxima.startsAt).getTime() : null;
  const estadoZoomActual =
    inicioProxima !== null && data.proxima != null
      ? estadoZoom({
          inicioMs: inicioProxima,
          ahoraMs: ahora,
          duracionMin: Number(data.proxima.duracionMin) || 60,
          tieneAcceso: ingreso,
        })
      : null;

  const nombreAlumno = data.alumno?.nombre ?? "";
  const partesNombre = nombreAlumno.split(" ").filter(Boolean);
  const iniciales =
    ((partesNombre[0]?.[0] ?? "") + (partesNombre.length > 1 ? (partesNombre[partesNombre.length - 1]?.[0] ?? "") : "")).toUpperCase() ||
    "🙂";

  const tipo = data.matricula?.tipoCurso ?? "JUNIOR";
  const curso = DESC_CURSO[tipo] ?? DESC_CURSO["JUNIOR"]!;
  const colorNivel = nivelActual !== undefined ? (COLOR_NIVEL[nivelActual.codigo] ?? "var(--lgs-azul)") : "var(--lgs-azul)";

  const moduloBox: CSSProperties = {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    padding: "0.6rem 0.4rem",
    borderRadius: "0.7rem",
    border: "1px solid #e3e7f0",
    background: "#fafbfe",
  };

  // Métricas del nivel actual para el modal "¿Cómo voy?"
  const pctNivelActual =
    nivelActual !== undefined
      ? Math.round((nivelActual.leccionesCompletadas / Math.max(nivelActual.totalLecciones, 1)) * 100)
      : 0;
  const faltanNivel =
    nivelActual !== undefined ? Math.max(nivelActual.totalLecciones - nivelActual.leccionesCompletadas, 0) : 0;
  const asistPct =
    data.asistencia != null && data.asistencia.totalSesiones > 0
      ? Math.round((data.asistencia.asistidas / data.asistencia.totalSesiones) * 100)
      : 0;
  const nivelesCompletados = niveles.filter((n) => n.estado === "COMPLETADO").length;

  // Acordeón de niveles → Stages (se muestra dentro del modal "¿Cómo voy?")
  const listaNiveles = (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {niveles.map((nivel) => {
        const completado = nivel.estado === "COMPLETADO";
        const abierto = nivelesAbiertos.has(nivel.levelId);
        const colorN = COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)";
        return (
          <div
            key={nivel.levelId}
            style={{
              border: "1px solid #edf0f6",
              borderLeft: `5px solid ${colorN}`,
              borderRadius: "0.7rem",
              overflow: "hidden",
              opacity: nivel.estado === "PENDIENTE" ? 0.7 : 1,
            }}
          >
            {/* Header clicable: despliega/colapsa las Stages */}
            <button
              type="button"
              onClick={() => toggleNivel(nivel.levelId)}
              aria-expanded={abierto}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.7rem 0.9rem",
                background: abierto ? "#fafbfe" : "transparent",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                textAlign: "left",
              }}
            >
              {/* Premio del mapa: imagen si existe (respaldo emoji); sombreado hasta completar, vivo al completar */}
              {(() => {
                const premioUrl = data.premios?.[nivel.codigo] ?? null;
                const estilo: CSSProperties = {
                  flex: "none",
                  width: "1.9rem",
                  height: "1.9rem",
                  filter: completado ? "none" : "grayscale(1)",
                  opacity: completado ? 1 : 0.35,
                  transform: completado ? "scale(1)" : "scale(0.92)",
                  transition: "opacity .2s, filter .2s, transform .2s",
                };
                return premioUrl !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={premioUrl}
                    alt={`Premio ${nivel.nombre}`}
                    title={completado ? "¡Premio conseguido!" : "Premio por completar el nivel"}
                    style={{ ...estilo, objectFit: "contain" }}
                  />
                ) : (
                  <span
                    aria-hidden
                    title={completado ? "¡Premio conseguido!" : "Premio por completar el nivel"}
                    style={{ ...estilo, fontSize: "1.7rem", lineHeight: "1.9rem", textAlign: "center" }}
                  >
                    {PREMIO_NIVEL[nivel.codigo] ?? "🏅"}
                  </span>
                );
              })()}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <strong>{nivel.nombre}</strong>
                  <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    {nivel.leccionesCompletadas}/{nivel.totalLecciones} · {nivel.levelUpAprobado ? "Level Up ✅" : "Level Up ⏳"}
                    <span aria-hidden style={{ fontSize: "0.7rem", transition: "transform .2s", transform: abierto ? "rotate(90deg)" : "none", color: colorN, fontWeight: 900 }}>
                      ▸
                    </span>
                  </span>
                </div>
                <div style={{ marginTop: "0.4rem", height: "0.45rem", borderRadius: "0.25rem", background: "#eef1f7", overflow: "hidden" }}>
                  <div style={{ width: `${(nivel.leccionesCompletadas / Math.max(nivel.totalLecciones, 1)) * 100}%`, height: "100%", background: colorN }} />
                </div>
              </div>
            </button>

            {/* Stages del nivel (Stage 1..N + Level Up) */}
            {abierto && (
              <div style={{ padding: "0.2rem 0.9rem 0.8rem 0.9rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {Array.from({ length: nivel.totalLecciones }).map((_, i) => {
                  const n = i + 1;
                  const hecha = n <= nivel.leccionesCompletadas;
                  const enCurso = n === nivel.leccionesCompletadas + 1 && nivel.estado !== "COMPLETADO";
                  return (
                    <div
                      key={n}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.5rem",
                        background: enCurso ? "#f3eefc" : "#fafbfe",
                        border: `1px solid ${enCurso ? colorN : "#edf0f6"}`,
                      }}
                    >
                      <span aria-hidden style={{ fontSize: "1rem" }}>{hecha ? "✅" : enCurso ? "▶️" : "🔒"}</span>
                      <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Stage {n}</span>
                      <span style={{ marginLeft: "auto", fontSize: "0.76rem", color: "var(--texto-suave)" }}>
                        {hecha ? "Completada" : enCurso ? "En curso" : "Bloqueada"}
                      </span>
                    </div>
                  );
                })}
                {/* Level Up final del nivel */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "0.5rem",
                    background: "#fff8e1",
                    border: "1px solid var(--lgs-amarillo)",
                  }}
                >
                  <span aria-hidden style={{ fontSize: "1rem" }}>{nivel.levelUpAprobado ? "🏆" : "⏳"}</span>
                  <span style={{ fontWeight: 800, fontSize: "0.88rem" }}>Level Up</span>
                  <span style={{ marginLeft: "auto", fontSize: "0.76rem", color: "var(--texto-suave)" }}>
                    {nivel.levelUpAprobado ? "Aprobado" : "Pendiente"}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Contenido del historial de clases (se muestra dentro del modal "Historial")
  const listaHistorial =
    data.historial === undefined || data.historial.length === 0 ? (
      <p style={{ color: "var(--texto-suave)" }}>Todavía no hay clases dictadas.</p>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {data.historial.map((h) => {
          const b =
            h.estado === "PRESENTE"
              ? { txt: "✔ Asistió", c: "#1b5e20", bg: "#e8f5e9" }
              : h.estado === "AUSENTE"
                ? { txt: "✘ Ausente", c: "#c62828", bg: "#ffebee" }
                : h.estado === "JUSTIFICADO"
                  ? { txt: "📝 Justificado", c: "#8a6d00", bg: "#fff8e1" }
                  : { txt: "— sin registro —", c: "#9e9e9e", bg: "#f5f5f5" };
          return (
            <div key={h.sessionId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.9rem", borderRadius: "0.6rem", background: "#fafbfe", flexWrap: "wrap", gap: "0.3rem" }}>
              <span style={{ fontWeight: 600 }}>
                {h.tipo === "CLUB" ? "🎉 Club" : `📘 Sesión ${h.numero}`} · {fechaLarga(`${h.fecha}T12:00:00`)}
              </span>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: b.c, background: b.bg, padding: "0.15rem 0.6rem", borderRadius: "1rem" }}>
                {b.txt}
              </span>
            </div>
          );
        })}
      </div>
    );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #eef4ff 0%, #f7f0ff 100%)" }}>
      {/* Barra superior */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "0.85rem 1.5rem",
          background: "white",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: "2.9rem",
              height: "2.9rem",
              flex: "none",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              color: "white",
              background: "linear-gradient(135deg, var(--lgs-azul) 0%, var(--lgs-magenta) 100%)",
            }}
          >
            {iniciales}
          </span>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: "1.25rem",
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              ¡Hola, {nombreAlumno || "campeón"}! 👋
            </h1>
            <p style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>Panel del estudiante</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: "none" }}>
          {nivelActual !== undefined && (
            <span
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "1rem",
                fontWeight: 800,
                fontSize: "0.82rem",
                color: "white",
                background: colorNivel,
                whiteSpace: "nowrap",
              }}
            >
              {nivelActual.nombre}
              {leccionActual !== null && ` · Lección ${String(leccionActual).padStart(2, "0")}`}
            </span>
          )}
          <button
            onClick={() => void salir()}
            title="Cerrar sesión"
            style={{ padding: "0.5rem 1rem", borderRadius: "0.6rem", border: "1px solid #e3e7f0", background: "white", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", whiteSpace: "nowrap" }}
          >
            Salir
          </button>
        </div>
      </header>

      {/* Barra de secciones (estilo MOSAICO): un botón de Clubes + accesos hasta Perfil */}
      <nav
        aria-label="Secciones del panel"
        style={{
          background: "white",
          borderTop: "1px solid #eef1f7",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
          padding: "0.5rem 1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => document.getElementById("agenda")?.scrollIntoView({ behavior: "smooth" })}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            padding: "0.5rem 1.1rem",
            borderRadius: "0.6rem",
            border: "none",
            background: "var(--lgs-verde)",
            color: "#1b2a10",
            fontWeight: 800,
            fontSize: "0.9rem",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          📅 Inscripción Clubes
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "0.15rem", marginLeft: "auto", flexWrap: "wrap" }}>
          {NAV_ITEMS.map((it) => {
            const base: CSSProperties = {
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.5rem 0.7rem",
              borderRadius: "0.6rem",
              color: "var(--texto-suave)",
              fontWeight: 700,
              fontSize: "0.85rem",
              textDecoration: "none",
              whiteSpace: "nowrap",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            };
            const inner = (
              <>
                <span aria-hidden style={{ fontSize: "0.95rem" }}>
                  {it.emoji}
                </span>
                <span>{it.label}</span>
                {it.menu === true && (
                  <span aria-hidden style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                    ▾
                  </span>
                )}
              </>
            );
            if (it.href !== undefined) {
              return (
                <a key={it.label} href={it.href} style={base}>
                  {inner}
                </a>
              );
            }
            if (it.action === "comovoy") {
              return (
                <button key={it.label} type="button" onClick={() => setVerComoVoy(true)} style={base}>
                  {inner}
                </button>
              );
            }
            if (it.action === "historial") {
              return (
                <button key={it.label} type="button" onClick={() => setVerHistorial(true)} style={base}>
                  {inner}
                </button>
              );
            }
            return (
              <button key={it.label} type="button" title="Próximamente" style={{ ...base, opacity: 0.6 }}>
                {inner}
              </button>
            );
          })}
        </div>
      </nav>

      {data.matricula === null ? (
        <main style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", color: "var(--texto-suave)" }}>
            Aún no estás matriculado en un salón. En cuanto tu apoderado complete la inscripción, aquí
            verás tus clases. 🎒
          </p>
        </main>
      ) : (
        <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Encabezado del curso: el texto vive AQUÍ (no sobre la imagen) para que el banner se vea limpio */}
          <section
            style={{
              ...card,
              padding: "0.75rem 1rem",
              borderLeft: `5px solid ${colorNivel}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "var(--texto-suave)", letterSpacing: "0.08em" }}>
                LGS KIDS · {curso.edad}
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 900, lineHeight: 1.1, margin: 0 }}>{curso.titulo}</h2>
                <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>{curso.desc}</span>
              </div>
            </div>
            {nivelActual !== undefined && (
              <span
                style={{
                  flex: "none",
                  padding: "0.3rem 0.8rem",
                  borderRadius: "1rem",
                  background: colorNivel,
                  color: "white",
                  fontWeight: 800,
                  fontSize: "0.8rem",
                  whiteSpace: "nowrap",
                }}
              >
                Nivel {nivelActual.nombre}
              </span>
            )}
          </section>

          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))" }}>
            {/* Columna izquierda: imagen del curso + info + sesión próxima */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Banner del curso: imagen LIMPIA (el texto vive en el encabezado, arriba). Clic → verla en grande. */}
              <div
                onClick={data.imagenCursoUrl != null ? () => setVerImagen(true) : undefined}
                role={data.imagenCursoUrl != null ? "button" : undefined}
                tabIndex={data.imagenCursoUrl != null ? 0 : undefined}
                onKeyDown={
                  data.imagenCursoUrl != null
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setVerImagen(true);
                        }
                      }
                    : undefined
                }
                aria-label={data.imagenCursoUrl != null ? "Ver la imagen del curso en grande" : undefined}
                title={data.imagenCursoUrl != null ? "Clic para ver más grande" : undefined}
                style={{
                  position: "relative",
                  borderRadius: "1rem",
                  overflow: "hidden",
                  aspectRatio: "16 / 9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: data.imagenCursoUrl != null ? "zoom-in" : "default",
                  background:
                    data.imagenCursoUrl == null
                      ? `linear-gradient(140deg, ${colorNivel} 0%, #1b2140 130%)`
                      : "#0a0e1e",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
                }}
              >
                {data.imagenCursoUrl != null ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={data.imagenCursoUrl}
                      alt={`Curso ${curso.titulo}${nivelActual !== undefined ? ` · Nivel ${nivelActual.nombre}` : ""}`}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        bottom: "0.5rem",
                        right: "0.6rem",
                        padding: "0.2rem 0.55rem",
                        borderRadius: "1rem",
                        background: "rgba(10,14,30,0.55)",
                        color: "white",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      🔍 Ver grande
                    </span>
                  </>
                ) : (
                  <span aria-hidden style={{ fontSize: "3.5rem", opacity: 0.85, lineHeight: 1 }}>
                    {tipo === "YOUNGSTER" ? "🚀" : "🧩"}
                  </span>
                )}
              </div>

              {/* Info del curso */}
              <section style={{ ...card, borderLeft: `6px solid ${colorNivel}` }}>
                <p style={{ fontSize: "1.2rem", fontWeight: 800 }}>{tipo}</p>
                <p style={{ fontSize: "0.9rem", color: "var(--texto-suave)" }}>
                  Campaña: {data.matricula.campania} · Salón: {data.matricula.salon}
                </p>
                {data.matricula.guia !== null && (
                  <p style={{ marginTop: "0.6rem", fontSize: "0.9rem" }}>
                    <span style={{ color: "var(--texto-suave)", fontSize: "0.78rem", fontWeight: 700 }}>GUÍA</span>
                    <br />
                    {data.matricula.guia}
                  </p>
                )}
              </section>

              {/* Sesión próxima */}
              <section style={card}>
                <h2 style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--lgs-purpura)", letterSpacing: "0.05em" }}>
                  SESIÓN PRÓXIMA
                </h2>
                {data.proxima != null ? (
                  <>
                    <p style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: "0.35rem" }}>
                      {data.proxima.tipo === "CLUB" ? "Club" : "Sesión"} · {fechaLarga(data.proxima.startsAt)}
                    </p>
                    <p style={{ fontSize: "0.9rem", color: "var(--texto-suave)" }}>
                      {hora(data.proxima.startsAt)} (tu hora local)
                      {data.proxima.guia !== null && ` · con ${data.proxima.guia}`}
                    </p>
                    <div style={{ marginTop: "0.8rem" }}>
                      <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--texto-suave)", marginBottom: "0.35rem" }}>
                        LINK DE INGRESO
                      </p>
                      {data.matricula.meetingUrl !== null && estadoZoomActual !== null ? (
                        <ZoomAccessButton
                          meetingUrl={data.matricula.meetingUrl}
                          estado={estadoZoomActual}
                          tieneAcceso={ingreso}
                          onEntrar={entrarZoom}
                        />
                      ) : (
                        <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                          El enlace lo asigna la guía del salón.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: "1rem", marginTop: "0.35rem", color: "var(--texto-suave)" }}>
                    No hay próximas clases programadas.
                  </p>
                )}
              </section>
            </div>

            {/* Columna derecha: sesiones + progreso */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <section id="avance" style={{ ...card, scrollMarginTop: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Sesiones</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem" }}>
                  {[
                    { n: data.asistencia?.asistidas ?? 0, t: "Asistidas", c: "#1b5e20", bg: "#e8f5e9" },
                    { n: data.asistencia?.ausentes ?? 0, t: "Ausentes", c: "#c62828", bg: "#ffebee" },
                    { n: data.asistencia?.justificadas ?? 0, t: "Justificadas", c: "#8a6d00", bg: "#fff8e1" },
                    { n: data.asistencia?.totalSesiones ?? 0, t: "Total", c: "#37474f", bg: "#eceff1" },
                  ].map((s) => (
                    <div key={s.t} style={{ textAlign: "center", padding: "0.8rem 0.3rem", borderRadius: "0.8rem", background: s.bg }}>
                      <div style={{ fontSize: "1.7rem", fontWeight: 800, color: s.c }}>{s.n}</div>
                      <div style={{ fontSize: "0.68rem", fontWeight: 700, color: s.c }}>{s.t}</div>
                    </div>
                  ))}
                </div>

                {/* Progreso del curso */}
                <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--texto-suave)" }}>
                  <span>Progreso del curso</span>
                  <span>
                    {compl} / {totalLecc} lecciones
                  </span>
                </div>
                <div style={{ marginTop: "0.35rem", height: "0.55rem", borderRadius: "0.3rem", background: "#eef1f7", overflow: "hidden" }}>
                  <div style={{ width: `${totalLecc > 0 ? (compl / totalLecc) * 100 : 0}%`, height: "100%", background: colorNivel }} />
                </div>

                {/* Nivel anterior / actual / próximo */}
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                  <div style={moduloBox}>
                    <div style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--texto-suave)" }}>NIVEL ANTERIOR</div>
                    <div style={{ fontWeight: 800 }}>{nivelAnterior?.nombre ?? "Welcome"}</div>
                  </div>
                  <div style={{ ...moduloBox, borderColor: colorNivel, background: "#f3eefc" }}>
                    <div style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--texto-suave)" }}>NIVEL ACTUAL</div>
                    <div style={{ fontWeight: 800 }}>{nivelActual?.nombre ?? "—"}</div>
                  </div>
                  <div style={moduloBox}>
                    <div style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--texto-suave)" }}>NIVEL PRÓXIMO</div>
                    <div style={{ fontWeight: 800 }}>{nivelProximo?.nombre ?? "—"}</div>
                  </div>
                </div>
              </section>

              {/* Mis próximas clases (en el lugar del antiguo "¿Cómo voy?") */}
              <section id="agenda" style={{ ...card, scrollMarginTop: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", marginBottom: "0.15rem" }}>🗓️ Mis próximas clases</h2>
                <p style={{ fontSize: "0.78rem", color: "var(--texto-suave)", marginBottom: "0.75rem" }}>
                  Sesiones y clubes de las próximas 2 semanas
                </p>
                {data.agenda === undefined || data.agenda.length === 0 ? (
                  <p style={{ color: "var(--texto-suave)" }}>Sin clases en las próximas 2 semanas.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {data.agenda.map((ev) => (
                      <div key={ev.sessionId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.9rem", borderRadius: "0.6rem", borderLeft: `4px solid ${ev.tipo === "CLUB" ? "var(--lgs-amarillo)" : "var(--lgs-azul)"}`, background: "#fafbfe", flexWrap: "wrap", gap: "0.3rem" }}>
                        <span style={{ fontWeight: 600 }}>
                          {ev.tipo === "CLUB" ? "🎉 Club" : "📘 Sesión"} · {fechaLarga(ev.startsAt)}
                        </span>
                        <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
                          {hora(ev.startsAt)}
                          {ev.guia !== null && ` · ${ev.guia}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>
          </div>

        </main>
      )}

      {/* Pie de página: asistencia por WhatsApp (colorido, con textura de puntos) */}
      <footer
        style={{
          marginTop: "1rem",
          borderTop: "1px solid #e6e9f5",
          background: "linear-gradient(160deg, #eef4ff 0%, #f7f0ff 100%)",
          backgroundImage:
            "radial-gradient(rgba(123,47,190,0.10) 1.5px, transparent 1.6px), radial-gradient(rgba(0,174,239,0.08) 1.5px, transparent 1.6px)",
          backgroundSize: "22px 22px, 22px 22px",
          backgroundPosition: "0 0, 11px 11px",
          padding: "1.75rem 1.5rem 2.5rem",
        }}
      >
        <p style={{ maxWidth: "72rem", margin: "0 auto", fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.1em", color: "var(--texto-suave)" }}>
          🆘 ASISTENCIA LGS KIDS
        </p>
        <div
          style={{
            maxWidth: "72rem",
            margin: "1rem auto 0",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            justifyContent: "space-around",
          }}
        >
          {SOPORTE.map((s) => (
            <a
              key={s.label}
              href={`https://wa.me/${s.tel}?text=${encodeURIComponent(s.msg)}`}
              target="_blank"
              rel="noreferrer"
              title={`Escribir por WhatsApp: ${s.label}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.55rem",
                textDecoration: "none",
                minWidth: "8rem",
              }}
            >
              <span
                style={{
                  width: "3.8rem",
                  height: "3.8rem",
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.5), rgba(255,255,255,0) 55%), ${s.color}`,
                  boxShadow: "0 10px 22px rgba(20,30,70,0.16), inset 0 -3px 8px rgba(0,0,0,0.12)",
                  border: "3px solid rgba(255,255,255,0.7)",
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                  <path d={WHATSAPP_PATH} />
                </svg>
              </span>
              <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "#2a2f52" }}>{s.label}</span>
              <span style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>WhatsApp</span>
            </a>
          ))}
        </div>
        <p style={{ maxWidth: "72rem", margin: "1.5rem auto 0", textAlign: "center", fontSize: "0.75rem", color: "var(--texto-suave)" }}>
          LGS Kids · lgskidsplataforma.com
        </p>
      </footer>

      {/* Lightbox del banner del curso */}
      {verImagen && data.imagenCursoUrl != null && (
        <div
          onClick={() => setVerImagen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen del curso ${curso.titulo}`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(8,11,24,0.86)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            cursor: "zoom-out",
          }}
        >
          <button
            onClick={() => setVerImagen(false)}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              width: "2.6rem",
              height: "2.6rem",
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.15)",
              color: "white",
              fontSize: "1.3rem",
              fontWeight: 700,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.imagenCursoUrl}
            alt={`Curso ${curso.titulo}${nivelActual !== undefined ? ` · Nivel ${nivelActual.nombre}` : ""}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              borderRadius: "0.9rem",
              boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
              cursor: "default",
            }}
          />
        </div>
      )}

      {/* Modal "¿Cómo voy?" (estilo MOSAICO): progreso del nivel + Stages por nivel */}
      {verComoVoy && (
        <div
          onClick={() => setVerComoVoy(false)}
          role="dialog"
          aria-modal="true"
          aria-label="¿Cómo voy?"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(8,11,24,0.55)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "2rem 1rem",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "40rem",
              background: "white",
              borderRadius: "1rem",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            {/* Encabezado del modal */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.1rem 1.25rem",
                borderBottom: "1px solid #eef1f7",
              }}
            >
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>📈 ¿Cómo voy?</h2>
              <button
                type="button"
                onClick={() => setVerComoVoy(false)}
                aria-label="Cerrar"
                style={{
                  width: "2.2rem",
                  height: "2.2rem",
                  borderRadius: "50%",
                  border: "1px solid #e3e7f0",
                  background: "white",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  color: "var(--texto-suave)",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* PROGRESO del nivel actual */}
              <div style={{ ...card, boxShadow: "none", border: "1px solid #eef1f7" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.06em", color: "var(--texto-suave)" }}>
                    PROGRESO — NIVEL {(nivelActual?.nombre ?? "").toUpperCase()}
                  </span>
                  <span style={{ fontSize: "1.5rem", fontWeight: 900, color: colorNivel }}>{pctNivelActual}%</span>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", marginTop: "0.15rem" }}>
                  Curso {tipo} · Nivel {nivelesCompletados}/{niveles.length} completados
                </p>
                <div style={{ marginTop: "0.6rem", height: "0.55rem", borderRadius: "0.3rem", background: "#eef1f7", overflow: "hidden" }}>
                  <div style={{ width: `${pctNivelActual}%`, height: "100%", background: colorNivel }} />
                </div>
                <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                  <span>
                    {nivelActual?.leccionesCompletadas ?? 0} de {nivelActual?.totalLecciones ?? 0} lecciones
                  </span>
                  <span>{asistPct}% asistencia</span>
                </div>
                <div style={{ marginTop: "0.7rem", padding: "0.7rem 0.9rem", borderRadius: "0.6rem", background: "#f4f6fb", fontSize: "0.88rem" }}>
                  {data.progreso?.diploma === true
                    ? "🎓 ¡Completaste todos los niveles! Diploma conseguido."
                    : faltanNivel > 0
                      ? `Te faltan ${faltanNivel} ${faltanNivel === 1 ? "sesión" : "sesiones"} para completar el nivel y avanzar.`
                      : "¡Completaste las sesiones del nivel! Falta aprobar el Level Up para avanzar."}
                </div>
              </div>

              {/* Niveles → Stages (clic para desplegar/colapsar) */}
              <div>
                <p style={{ fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.06em", color: "var(--texto-suave)", marginBottom: "0.6rem" }}>
                  NIVELES DEL CURSO · toca un nivel para ver sus Stages
                </p>
                {listaNiveles}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Historial de clases" (se abre desde el ítem Historial del nav) */}
      {verHistorial && (
        <div
          onClick={() => setVerHistorial(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Historial de clases"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(8,11,24,0.55)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "2rem 1rem",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "40rem",
              background: "white",
              borderRadius: "1rem",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.1rem 1.25rem",
                borderBottom: "1px solid #eef1f7",
              }}
            >
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>📚 Historial de clases</h2>
              <button
                type="button"
                onClick={() => setVerHistorial(false)}
                aria-label="Cerrar"
                style={{
                  width: "2.2rem",
                  height: "2.2rem",
                  borderRadius: "50%",
                  border: "1px solid #e3e7f0",
                  background: "white",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  color: "var(--texto-suave)",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "1.25rem" }}>{listaHistorial}</div>
          </div>
        </div>
      )}
    </div>
  );
}
