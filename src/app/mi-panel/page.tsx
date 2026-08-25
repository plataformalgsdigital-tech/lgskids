"use client";

import Image from "next/image";
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
}

const COLOR_NIVEL: Record<string, string> = {
  ROOKIE: "var(--lgs-verde)",
  CHAMPION: "var(--lgs-cian)",
  ELITE: "var(--lgs-amarillo)",
  LEGENDARY: "var(--lgs-magenta)",
  ULTIMATE: "var(--lgs-purpura)",
};

const card: CSSProperties = {
  background: "white",
  borderRadius: "1rem",
  padding: "1.25rem",
  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
};

function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MiPanelPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [ingreso, setIngreso] = useState(false); // ya entró a la clase (reconexión)

  // Reloj para habilitar/deshabilitar el botón de clase en vivo.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
        // No es alumno: al panel de gestión.
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

  // Reconexión: si ya ingresó a esta sesión, su ícono sigue activo (se recuerda
  // por sesión en el navegador). Un F5 no pierde el derecho de reconexión.
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

  const nivelActual = data.progreso?.niveles.find((n) => n.estado === "EN_CURSO");
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
    (
      (partesNombre[0]?.[0] ?? "") +
      (partesNombre.length > 1 ? (partesNombre[partesNombre.length - 1]?.[0] ?? "") : "")
    ).toUpperCase() || "🙂";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #eef4ff 0%, #f7f0ff 100%)",
      }}
    >
      {/* Barra superior */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "1rem 1.5rem",
          background: "white",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Image src="/logo.jpg" alt="LGS Kids" width={48} height={43} style={{ height: "auto" }} />
          <div>
            <h1 style={{ fontSize: "1.4rem", lineHeight: 1.1 }}>
              ¡Hola, {data.alumno?.nombre ?? "campeón"}! 👋
            </h1>
            <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
              Tu espacio en LGS Kids
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {nivelActual !== undefined && (
            <span
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "1rem",
                fontWeight: 700,
                fontSize: "0.85rem",
                color: "white",
                background: COLOR_NIVEL[nivelActual.codigo] ?? "var(--lgs-azul)",
              }}
            >
              Nivel {nivelActual.nombre}
            </span>
          )}
          <button
            onClick={() => void salir()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.6rem",
              border: "1px solid #e3e7f0",
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {data.matricula === null ? (
        <main style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", color: "var(--texto-suave)" }}>
            Aún no estás matriculado en un salón. En cuanto tu apoderado complete la inscripción,
            aquí verás tus clases. 🎒
          </p>
        </main>
      ) : (
        <main
          style={{
            maxWidth: "70rem",
            margin: "0 auto",
            padding: "1.5rem",
            display: "grid",
            gap: "1.25rem",
            gridTemplateColumns: "1fr",
          }}
        >
          {/* Próxima clase — protagonista */}
          <section
            style={{
              ...card,
              background: "linear-gradient(135deg, var(--lgs-azul) 0%, var(--lgs-purpura) 100%)",
              color: "white",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1.1rem", flexWrap: "wrap" }}>
              {/* Foto del niño (avatar con iniciales mientras no se cargue foto) */}
              <div
                aria-hidden="true"
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "50%",
                  flex: "none",
                  background: "rgba(255,255,255,0.22)",
                  border: "3px solid rgba(255,255,255,0.7)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.7rem",
                  fontWeight: 800,
                  color: "white",
                }}
              >
                {iniciales}
              </div>
              <div>
                <p style={{ fontSize: "1.4rem", fontWeight: 800, lineHeight: 1.1 }}>
                  {nombreAlumno}
                </p>
                <p style={{ opacity: 0.85, fontSize: "0.85rem", fontWeight: 700, marginTop: "0.4rem" }}>
                  📅 TU PRÓXIMA CLASE
                </p>
                {data.proxima != null ? (
                  <>
                    <p style={{ fontSize: "1.35rem", fontWeight: 800, marginTop: "0.15rem" }}>
                      {data.proxima.tipo === "CLUB" ? "Club" : "Sesión"} ·{" "}
                      {fechaLarga(data.proxima.startsAt)}
                    </p>
                    <p style={{ fontSize: "1.05rem", opacity: 0.95 }}>
                      {hora(data.proxima.startsAt)} (tu hora local)
                      {data.proxima.guia !== null && ` · con ${data.proxima.guia}`}
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: "1.15rem", marginTop: "0.15rem" }}>
                    No hay próximas clases programadas.
                  </p>
                )}
              </div>
            </div>
            {data.matricula.meetingUrl !== null &&
              estadoZoomActual !== null &&
              (
                <ZoomAccessButton
                  meetingUrl={data.matricula.meetingUrl}
                  estado={estadoZoomActual}
                  tieneAcceso={ingreso}
                  onEntrar={entrarZoom}
                  textoClaro
                />
              )}
          </section>

          {/* Salón + estadísticas de asistencia */}
          <div
            style={{
              display: "grid",
              gap: "1.25rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
            }}
          >
            <section style={card}>
              <h2 style={{ fontSize: "1rem", color: "var(--texto-suave)", marginBottom: "0.5rem" }}>
                MI SALÓN
              </h2>
              <p style={{ fontSize: "1.25rem", fontWeight: 800 }}>{data.matricula.salon}</p>
              <p style={{ fontSize: "0.9rem", color: "var(--texto-suave)" }}>
                {data.matricula.tipoCurso} · {data.matricula.campania}
              </p>
              {data.matricula.guia !== null && (
                <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                  <strong>Guía:</strong> {data.matricula.guia}
                </p>
              )}
            </section>

            <section style={{ ...card, gridColumn: "span 2", minWidth: 0 }}>
              <h2
                style={{ fontSize: "1rem", color: "var(--texto-suave)", marginBottom: "0.75rem" }}
              >
                MIS SESIONES
              </h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "0.6rem",
                }}
              >
                {[
                  {
                    n: data.asistencia?.asistidas ?? 0,
                    t: "Asistidas",
                    c: "#1b5e20",
                    bg: "#e8f5e9",
                  },
                  { n: data.asistencia?.ausentes ?? 0, t: "Ausentes", c: "#c62828", bg: "#ffebee" },
                  {
                    n: data.asistencia?.justificadas ?? 0,
                    t: "Justificadas",
                    c: "#8a6d00",
                    bg: "#fff8e1",
                  },
                  {
                    n: data.asistencia?.totalSesiones ?? 0,
                    t: "Total",
                    c: "#37474f",
                    bg: "#eceff1",
                  },
                ].map((s) => (
                  <div
                    key={s.t}
                    style={{
                      textAlign: "center",
                      padding: "0.9rem 0.4rem",
                      borderRadius: "0.8rem",
                      background: s.bg,
                    }}
                  >
                    <div style={{ fontSize: "1.9rem", fontWeight: 800, color: s.c }}>{s.n}</div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: s.c }}>{s.t}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ¿Cómo voy? — progreso por nivel con medallas */}
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.15rem" }}>📈 ¿Cómo voy?</h2>
              {data.progreso?.diploma === true && (
                <span
                  style={{
                    padding: "0.35rem 0.9rem",
                    borderRadius: "1rem",
                    background: "#fff8e1",
                    border: "2px solid var(--lgs-amarillo)",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                  }}
                >
                  🎓 ¡Diploma!
                </span>
              )}
            </div>
            <div
              style={{
                marginTop: "0.9rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
                gap: "0.75rem",
              }}
            >
              {data.progreso?.niveles.map((nivel) => (
                <div
                  key={nivel.levelId}
                  style={{
                    border: "1px solid #edf0f6",
                    borderTop: `5px solid ${COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)"}`,
                    borderRadius: "0.8rem",
                    padding: "0.9rem",
                    opacity: nivel.estado === "PENDIENTE" ? 0.6 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <strong>{nivel.nombre}</strong>
                    {nivel.medalla && <span style={{ fontSize: "1.5rem" }}>🏅</span>}
                  </div>
                  <div
                    style={{
                      marginTop: "0.5rem",
                      height: "0.5rem",
                      borderRadius: "0.25rem",
                      background: "#eef1f7",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${(nivel.leccionesCompletadas / Math.max(nivel.totalLecciones, 1)) * 100}%`,
                        height: "100%",
                        background: COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)",
                      }}
                    />
                  </div>
                  <p
                    style={{ marginTop: "0.4rem", fontSize: "0.8rem", color: "var(--texto-suave)" }}
                  >
                    {nivel.leccionesCompletadas}/{nivel.totalLecciones} lecciones ·{" "}
                    {nivel.levelUpAprobado ? "Level Up ✅" : "Level Up pendiente"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Agenda semanal */}
          <section style={card}>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>🗓️ Mis próximas clases</h2>
            {data.agenda === undefined || data.agenda.length === 0 ? (
              <p style={{ color: "var(--texto-suave)" }}>Sin clases próximas.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {data.agenda.map((ev) => (
                  <div
                    key={ev.sessionId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.6rem 0.9rem",
                      borderRadius: "0.6rem",
                      borderLeft: `4px solid ${ev.tipo === "CLUB" ? "var(--lgs-amarillo)" : "var(--lgs-azul)"}`,
                      background: "#fafbfe",
                      flexWrap: "wrap",
                      gap: "0.3rem",
                    }}
                  >
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

          {/* Historial de clases */}
          <section style={card}>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>📚 Historial de clases</h2>
            {data.historial === undefined || data.historial.length === 0 ? (
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
                    <div
                      key={h.sessionId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.5rem 0.9rem",
                        borderRadius: "0.6rem",
                        background: "#fafbfe",
                        flexWrap: "wrap",
                        gap: "0.3rem",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {h.tipo === "CLUB" ? "🎉 Club" : `📘 Sesión ${h.numero}`} ·{" "}
                        {fechaLarga(`${h.fecha}T12:00:00`)}
                      </span>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          color: b.c,
                          background: b.bg,
                          padding: "0.15rem 0.6rem",
                          borderRadius: "1rem",
                        }}
                      >
                        {b.txt}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
