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
}

const COLOR_NIVEL: Record<string, string> = {
  ROOKIE: "var(--lgs-verde)",
  CHAMPION: "var(--lgs-cian)",
  ELITE: "var(--lgs-amarillo)",
  LEGENDARY: "var(--lgs-magenta)",
  ULTIMATE: "var(--lgs-purpura)",
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

      {data.matricula === null ? (
        <main style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", color: "var(--texto-suave)" }}>
            Aún no estás matriculado en un salón. En cuanto tu apoderado complete la inscripción, aquí
            verás tus clases. 🎒
          </p>
        </main>
      ) : (
        <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))" }}>
            {/* Columna izquierda: imagen del curso + info + sesión próxima */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Banner del curso (según curso y nivel) */}
              <div
                style={{
                  position: "relative",
                  borderRadius: "1rem",
                  overflow: "hidden",
                  minHeight: "15rem",
                  padding: "1.4rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  color: "white",
                  background: `linear-gradient(140deg, ${colorNivel} 0%, #1b2140 130%)`,
                  boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
                }}
              >
                {data.imagenCursoUrl != null && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={data.imagenCursoUrl}
                      alt={`Curso ${curso.titulo}`}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,14,30,0.72) 10%, rgba(10,14,30,0.15) 70%)" }} />
                  </>
                )}
                {data.imagenCursoUrl == null && (
                  <span aria-hidden style={{ position: "absolute", top: "-1.5rem", right: "0.5rem", fontSize: "9rem", opacity: 0.16, lineHeight: 1 }}>
                    {tipo === "YOUNGSTER" ? "🚀" : "🧩"}
                  </span>
                )}
                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, opacity: 0.9, letterSpacing: "0.08em" }}>
                    LGS KIDS · {curso.edad}
                  </span>
                  <h2 style={{ fontSize: "2.4rem", fontWeight: 900, lineHeight: 1, margin: "0.2rem 0" }}>{curso.titulo}</h2>
                  {nivelActual !== undefined && (
                    <span style={{ display: "inline-block", alignSelf: "flex-start", padding: "0.2rem 0.7rem", borderRadius: "1rem", background: "rgba(255,255,255,0.22)", fontWeight: 800, fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                      Nivel {nivelActual.nombre}
                    </span>
                  )}
                  <p style={{ fontSize: "0.9rem", opacity: 0.95, maxWidth: "26rem" }}>{curso.desc}</p>
                </div>
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
              <section style={card}>
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
                    <div style={{ fontWeight: 800 }}>{nivelAnterior?.nombre ?? "—"}</div>
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

              {/* ¿Cómo voy? — niveles con medallas */}
              <section style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ fontSize: "1.1rem" }}>📈 ¿Cómo voy?</h2>
                  {data.progreso?.diploma === true && (
                    <span style={{ padding: "0.3rem 0.8rem", borderRadius: "1rem", background: "#fff8e1", border: "2px solid var(--lgs-amarillo)", fontWeight: 800, fontSize: "0.82rem" }}>
                      🎓 ¡Diploma!
                    </span>
                  )}
                </div>
                <div style={{ marginTop: "0.8rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {niveles.map((nivel) => (
                    <div key={nivel.levelId} style={{ border: "1px solid #edf0f6", borderLeft: `5px solid ${COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)"}`, borderRadius: "0.7rem", padding: "0.7rem 0.9rem", opacity: nivel.estado === "PENDIENTE" ? 0.6 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{nivel.nombre}</strong>
                        <span style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                          {nivel.medalla && "🏅 "}
                          {nivel.leccionesCompletadas}/{nivel.totalLecciones} · {nivel.levelUpAprobado ? "Level Up ✅" : "Level Up ⏳"}
                        </span>
                      </div>
                      <div style={{ marginTop: "0.4rem", height: "0.45rem", borderRadius: "0.25rem", background: "#eef1f7", overflow: "hidden" }}>
                        <div style={{ width: `${(nivel.leccionesCompletadas / Math.max(nivel.totalLecciones, 1)) * 100}%`, height: "100%", background: COLOR_NIVEL[nivel.codigo] ?? "var(--lgs-azul)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* Agenda */}
          <section style={card}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>🗓️ Mis próximas clases</h2>
            {data.agenda === undefined || data.agenda.length === 0 ? (
              <p style={{ color: "var(--texto-suave)" }}>Sin clases próximas.</p>
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

          {/* Historial */}
          <section style={card}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>📚 Historial de clases</h2>
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
            )}
          </section>
        </main>
      )}
    </div>
  );
}
