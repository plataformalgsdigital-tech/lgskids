"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { AcademicChangeModal } from "./AcademicChangeModal";

/**
 * ACADEMIC INFO de la ficha del niño: dónde está (curso, nivel, salón,
 * lección) con el botón Academic Change, su avance por nivel y su tabla de
 * asistencia. Todo se LEE de lo que ya deriva el servidor: el avance de la
 * función central y la asistencia de las marcas; nada se recalcula aquí.
 */

interface Nivel {
  levelId: string;
  codigo: string;
  nombre: string;
  orden: number;
  leccionesCompletadas: number;
  totalLecciones: number;
  levelUpAprobado: boolean;
  estado: "EN_CURSO" | "COMPLETADO" | "PENDIENTE";
  medalla: boolean;
  convalidado: boolean;
}
interface Progreso {
  curso: { courseId: string; tipo: string; campania: string } | null;
  niveles: Nivel[];
  diploma: boolean;
  ubicacion: { levelId: string; lecciones: number; motivo: string; actualizada: string } | null;
}
type Estado = "PRESENTE" | "AUSENTE" | "JUSTIFICADO";
interface Fila {
  sessionId: string;
  salon: string;
  tipo: string;
  fecha: string;
  startsAt: string;
  guia: string | null;
  meetingUrl: string | null;
  claseNumero: number | null;
  leccion: string | null;
  leccionNivel: string | null;
  estado: Estado | null;
  justificacion: string | null;
  editable: boolean;
}

const NIVEL_UI: Record<string, string> = {
  ROOKIE: "Rookie",
  CHAMPION: "Champion",
  ELITE: "Elite",
  LEGENDARY: "Legendary",
  ULTIMATE: "Ultimate Stage",
};
const CURSO_UI: Record<string, string> = { JUNIOR: "Junior (6–9)", YOUNGSTER: "Youngster (10–13)" };
const TIPO_UI: Record<string, { texto: string; bg: string; fg: string }> = {
  SESION: { texto: "SESIÓN", bg: "#e3f2fd", fg: "#0d47a1" },
  CLUB: { texto: "CLUB", bg: "#e8f5e9", fg: "#1b5e20" },
  TALLER: { texto: "TALLER", bg: "#f3e5f5", fg: "#6a1b9a" },
};
const ESTADO_UI: Record<string, { texto: string; bg: string; fg: string }> = {
  PRESENTE: { texto: "Sí", bg: "#e8f5e9", fg: "#1b5e20" },
  AUSENTE: { texto: "No", bg: "#fdecea", fg: "#b71c1c" },
  JUSTIFICADO: { texto: "Justificada", bg: "#fff8e1", fg: "#8a5a00" },
  SIN: { texto: "Sin marcar", bg: "#eceff1", fg: "#5a6172" },
};

const card: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1.25rem",
  marginTop: "1rem",
};
const chip = (bg: string, fg: string): CSSProperties => ({
  background: bg,
  color: fg,
  padding: "0.15rem 0.55rem",
  borderRadius: "1rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
});
const mini: CSSProperties = {
  padding: "0.2rem 0.5rem",
  borderRadius: "0.45rem",
  border: "1px solid #d8dce6",
  background: "white",
  cursor: "pointer",
  fontSize: "0.75rem",
  fontWeight: 700,
};
const filtro: CSSProperties = {
  padding: "0.45rem 0.55rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.85rem",
  width: "100%",
};
const th: CSSProperties = {
  padding: "0.55rem 0.6rem",
  textAlign: "left",
  fontSize: "0.72rem",
  letterSpacing: "0.04em",
  color: "var(--texto-suave)",
  whiteSpace: "nowrap",
};
const td: CSSProperties = { padding: "0.55rem 0.6rem", verticalAlign: "top" };

/** "Leccion 3" del catálogo → "Lección 3". */
function leccionUi(f: Fila): string {
  if (f.claseNumero === null) return f.tipo === "SESION" ? "Sesión extra" : "—";
  const n = f.leccion?.match(/\d+/)?.[0];
  return f.leccion === null ? "Por asignar" : n !== undefined ? `Lección ${n}` : f.leccion;
}

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const d = (await res.json()) as { error?: { message?: string } };
    return d.error?.message ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

export function AcademicInfo(props: {
  childPersonId: string;
  contractId: string | null;
  nombre: string;
  salon: string | null;
  /** Avisa a la ficha que algo cambió (salón, curso) para recargarla. */
  onCambio: () => void;
}) {
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [justificando, setJustificando] = useState<{ sessionId: string; texto: string } | null>(
    null,
  );
  const [f, setF] = useState({ desde: "", hasta: "", estado: "", guia: "" });

  const cargar = useCallback(async () => {
    const [rp, ra] = await Promise.all([
      apiFetch(`/api/progression/children/${props.childPersonId}`),
      apiFetch(`/api/attendance/children/${props.childPersonId}`),
    ]);
    if (rp.ok) setProgreso((await rp.json()) as Progreso);
    else setError(await mensajeDeError(rp, "No se pudo cargar el avance."));
    if (ra.ok) setFilas(((await ra.json()) as { filas: Fila[] }).filas);
    else setError(await mensajeDeError(ra, "No se pudo cargar la asistencia."));
  }, [props.childPersonId]);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      if (vigente) await cargar();
    })();
    return () => {
      vigente = false;
    };
  }, [cargar]);

  // Dónde va: el primer nivel sin completar y la lección que le sigue a las
  // cursadas (la misma regla del panel del niño).
  const nivelActual = progreso?.niveles.find((n) => n.estado !== "COMPLETADO") ?? null;
  const leccionActual =
    nivelActual !== null
      ? Math.min(nivelActual.leccionesCompletadas + 1, nivelActual.totalLecciones)
      : null;
  const egresado = progreso !== null && progreso.niveles.length > 0 && nivelActual === null;

  const guias = useMemo(
    () => [...new Set((filas ?? []).map((x) => x.guia).filter((g): g is string => g !== null))],
    [filas],
  );
  const visibles = (filas ?? []).filter(
    (x) =>
      (f.desde === "" || x.fecha >= f.desde) &&
      (f.hasta === "" || x.fecha <= f.hasta) &&
      (f.estado === "" || (x.estado ?? "SIN") === f.estado) &&
      (f.guia === "" || x.guia === f.guia),
  );
  const resumen = (filas ?? []).reduce<Record<string, number>>((acc, x) => {
    const k = x.estado ?? "SIN";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  async function marcar(fila: Fila, estado: Estado, justificacion: string | null) {
    setOcupado(fila.sessionId);
    setError(null);
    try {
      // El MISMO camino de pasar lista (regla 4: dispara la función central).
      const res = await apiFetch(`/api/attendance/sessions/${fila.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marcas: [{ childPersonId: props.childPersonId, estado, justificacion }],
        }),
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo marcar la asistencia."));
        return;
      }
      setJustificando(null);
      await cargar();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, marginTop: "1rem" }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p role="status" style={{ color: "#1b5e20", fontWeight: 700, marginTop: "1rem" }}>
          ✔ {aviso}
        </p>
      )}

      {/* ── Dónde está + Academic Change ─────────────────────────── */}
      <section style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.6rem",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Ubicación académica</h2>
          {props.contractId !== null && (
            <button
              type="button"
              onClick={() => {
                setAviso(null);
                setModal(true);
              }}
              style={{
                padding: "0.5rem 1.1rem",
                borderRadius: "0.6rem",
                border: "none",
                background: "var(--lgs-azul)",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              🔀 Academic Change
            </button>
          )}
        </div>
        <div
          style={{
            marginTop: "0.9rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
            gap: "0.9rem",
          }}
        >
          {[
            [
              "Curso",
              progreso?.curso ? (CURSO_UI[progreso.curso.tipo] ?? progreso.curso.tipo) : "—",
            ],
            ["Nivel", egresado ? "🎓 Egresado" : (nivelActual?.nombre ?? "—")],
            ["Salón", props.salon ?? "— sin matrícula —"],
            [
              "Lección",
              leccionActual !== null && nivelActual !== null
                ? `${String(leccionActual)} de ${String(nivelActual.totalLecciones)}`
                : "—",
            ],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>{k}</div>
              <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{v}</div>
            </div>
          ))}
        </div>
        {progreso?.ubicacion != null && (
          <p style={{ margin: "0.8rem 0 0", fontSize: "0.8rem", color: "#8a5a00" }}>
            📌 Ubicado por coordinación ({progreso.ubicacion.actualizada.slice(0, 10)}):{" "}
            {progreso.ubicacion.motivo}
          </p>
        )}
      </section>

      {/* ── Avance ──────────────────────────────────────────────── */}
      <section style={card}>
        <h2 style={{ fontSize: "1.1rem", margin: 0 }}>
          Avance {progreso?.diploma === true && <span title="Diploma">🎓</span>}
        </h2>
        {progreso !== null && progreso.niveles.length === 0 && (
          <p style={{ color: "var(--texto-suave)", marginTop: "0.6rem" }}>
            Sin matrícula activa: no hay avance que mostrar.
          </p>
        )}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginTop: "0.8rem" }}
        >
          {progreso?.niveles.map((n) => {
            const pct =
              n.totalLecciones > 0 ? (n.leccionesCompletadas / n.totalLecciones) * 100 : 0;
            // La función central marca EN_CURSO a todo nivel sin completar; en
            // curso de verdad está solo el primero de ellos.
            const pendiente = n.estado !== "COMPLETADO" && n.levelId !== nivelActual?.levelId;
            return (
              <div
                key={n.levelId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "9rem 1fr auto",
                  gap: "0.7rem",
                  alignItems: "center",
                  opacity: pendiente ? 0.55 : 1,
                }}
              >
                <strong style={{ fontSize: "0.92rem" }}>
                  {n.medalla ? "🏅 " : ""}
                  {n.nombre}
                </strong>
                <div
                  style={{ height: "0.55rem", borderRadius: "1rem", background: "#eef1f7" }}
                  aria-label={`${String(n.leccionesCompletadas)} de ${String(n.totalLecciones)} lecciones`}
                >
                  <div
                    style={{
                      width: `${String(pct)}%`,
                      height: "100%",
                      borderRadius: "1rem",
                      background: n.convalidado ? "#b0bec5" : "var(--lgs-verde)",
                    }}
                  />
                </div>
                <span style={{ display: "flex", gap: "0.35rem", fontSize: "0.78rem" }}>
                  <span>
                    {n.leccionesCompletadas}/{n.totalLecciones} lecc.
                  </span>
                  <span>· Level Up {n.levelUpAprobado ? "✔" : "—"}</span>
                  {n.convalidado ? (
                    <span style={chip("#eceff1", "#455a64")}>Convalidado</span>
                  ) : n.estado === "COMPLETADO" ? (
                    <span style={chip("#e8f5e9", "#1b5e20")}>Completado</span>
                  ) : pendiente ? (
                    <span style={chip("#eceff1", "#78909c")}>Pendiente</span>
                  ) : (
                    <span style={chip("#e3f2fd", "#0d47a1")}>En curso</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Tabla de asistencia ─────────────────────────────────── */}
      <section style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Tabla de asistencia</h2>
          <span style={{ fontSize: "0.82rem", color: "var(--texto-suave)" }}>
            Asistió {resumen.PRESENTE ?? 0} · No asistió {resumen.AUSENTE ?? 0} · Justificadas{" "}
            {resumen.JUSTIFICADO ?? 0} · Sin marcar {resumen.SIN ?? 0}
          </span>
        </div>
        <div
          style={{
            marginTop: "0.8rem",
            padding: "0.8rem",
            borderRadius: "0.7rem",
            background: "#f7f8fb",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
            gap: "0.6rem",
            alignItems: "end",
          }}
        >
          <label style={{ fontSize: "0.78rem" }}>
            Fecha desde
            <input
              type="date"
              value={f.desde}
              onChange={(e) => setF({ ...f, desde: e.target.value })}
              style={filtro}
            />
          </label>
          <label style={{ fontSize: "0.78rem" }}>
            Fecha hasta
            <input
              type="date"
              value={f.hasta}
              onChange={(e) => setF({ ...f, hasta: e.target.value })}
              style={filtro}
            />
          </label>
          <label style={{ fontSize: "0.78rem" }}>
            Estado de asistencia
            <select
              value={f.estado}
              onChange={(e) => setF({ ...f, estado: e.target.value })}
              style={filtro}
            >
              <option value="">Todos</option>
              <option value="PRESENTE">Asistió</option>
              <option value="AUSENTE">No asistió</option>
              <option value="JUSTIFICADO">Justificada</option>
              <option value="SIN">Sin marcar</option>
            </select>
          </label>
          <label style={{ fontSize: "0.78rem" }}>
            Guía
            <select
              value={f.guia}
              onChange={(e) => setF({ ...f, guia: e.target.value })}
              style={filtro}
            >
              <option value="">Todos los guías</option>
              {guias.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setF({ desde: "", hasta: "", estado: "", guia: "" })}
            style={{ ...mini, padding: "0.45rem 0.6rem" }}
          >
            Limpiar filtros
          </button>
        </div>

        {filas !== null && visibles.length === 0 && (
          <p style={{ color: "var(--texto-suave)", marginTop: "0.8rem" }}>
            {filas.length === 0
              ? "Todavía no tiene sesiones dictadas."
              : "Ninguna sesión coincide con los filtros."}
          </p>
        )}
        {visibles.length > 0 && (
          <div style={{ overflowX: "auto", marginTop: "0.8rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid #e3e7f0" }}>
                  {[
                    "FECHA",
                    "TIPO",
                    "GUÍA",
                    "NIVEL",
                    "LECCIÓN",
                    "ZOOM",
                    "ASISTENCIA",
                    "GESTIONAR",
                  ].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((x) => {
                  const t = TIPO_UI[x.tipo] ?? { texto: x.tipo, bg: "#eceff1", fg: "#37474f" };
                  const e = ESTADO_UI[x.estado ?? "SIN"] ?? ESTADO_UI.SIN!;
                  const editando = justificando?.sessionId === x.sessionId;
                  return (
                    <tr key={x.sessionId} style={{ borderBottom: "1px solid #edf0f6" }}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {new Date(x.startsAt).toLocaleString("es", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        <div style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>
                          {x.salon}
                        </div>
                      </td>
                      <td style={td}>
                        <span style={chip(t.bg, t.fg)}>{t.texto}</span>
                      </td>
                      <td style={td}>{x.guia ?? "—"}</td>
                      <td style={td}>
                        {x.leccionNivel !== null
                          ? (NIVEL_UI[x.leccionNivel] ?? x.leccionNivel)
                          : "—"}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{leccionUi(x)}</td>
                      <td style={td}>
                        {x.meetingUrl !== null ? (
                          <a href={x.meetingUrl} target="_blank" rel="noreferrer">
                            🔗 Zoom
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={td}>
                        <span style={chip(e.bg, e.fg)}>{e.texto}</span>
                        {x.justificacion !== null && (
                          <div
                            style={{ fontSize: "0.72rem", color: "#8a5a00", marginTop: "0.2rem" }}
                          >
                            {x.justificacion}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        {!x.editable ? (
                          <span
                            style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}
                            title="Ya no está en ese salón: su lista es la del salón actual."
                          >
                            Salón anterior
                          </span>
                        ) : editando ? (
                          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                            <input
                              autoFocus
                              value={justificando.texto}
                              onChange={(ev) =>
                                setJustificando({ sessionId: x.sessionId, texto: ev.target.value })
                              }
                              placeholder="Motivo de la ausencia"
                              maxLength={300}
                              style={{ ...filtro, width: "12rem", padding: "0.3rem 0.45rem" }}
                            />
                            <button
                              type="button"
                              style={mini}
                              disabled={ocupado !== null || justificando.texto.trim() === ""}
                              onClick={() =>
                                void marcar(x, "JUSTIFICADO", justificando.texto.trim())
                              }
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              style={mini}
                              onClick={() => setJustificando(null)}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                            {x.estado !== "PRESENTE" && (
                              <button
                                type="button"
                                style={mini}
                                disabled={ocupado !== null}
                                onClick={() => void marcar(x, "PRESENTE", null)}
                              >
                                ✔ Asistió
                              </button>
                            )}
                            {x.estado !== "AUSENTE" && (
                              <button
                                type="button"
                                style={mini}
                                disabled={ocupado !== null}
                                onClick={() => void marcar(x, "AUSENTE", null)}
                              >
                                ✘ No asistió
                              </button>
                            )}
                            <button
                              type="button"
                              style={mini}
                              disabled={ocupado !== null}
                              onClick={() =>
                                setJustificando({
                                  sessionId: x.sessionId,
                                  texto: x.justificacion ?? "",
                                })
                              }
                            >
                              ✎ Justificar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && props.contractId !== null && (
        <AcademicChangeModal
          contractId={props.contractId}
          childPersonId={props.childPersonId}
          nombre={props.nombre}
          nivelActual={egresado ? "Egresado" : (nivelActual?.nombre ?? null)}
          leccionActual={leccionActual}
          onCerrar={() => setModal(false)}
          onHecho={(mensaje) => {
            setModal(false);
            setAviso(mensaje);
            void cargar();
            props.onCambio();
          }}
        />
      )}
    </>
  );
}
