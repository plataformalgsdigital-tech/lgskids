"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * EL LIBRO DE UN ALUMNO, para su guía (2026-11-06): lo que reportó el libro de
 * evaluaciones, juegos y souvenirs —datos del navegador, no una calificación de
 * la plataforma— y sus PROYECTOS escritos, que el guía revisa con la rúbrica
 * de 4 criterios. Las reglas (criterios, 6/8 sin ceros, 3 entregas) las sirve
 * la API: la pantalla no las copia.
 */

type Decision = "approved" | "changes_requested";
type EstadoProyecto = "not_submitted" | "pending_review" | "changes_requested" | "approved";

interface Revision {
  decision: Decision;
  puntajes: number[];
  comentario: string;
  revisadoPor: string;
  revisadoEn: string;
}
interface Entrega {
  id: string;
  intento: number;
  texto: string;
  enviadoEn: string | null;
  recibidoEn: string;
  revisiones: Revision[];
}
interface Proyecto {
  unidad: number;
  estado: EstadoProyecto;
  limite: number;
  conBorrador: boolean;
  entregas: Entrega[];
}
interface Evaluacion {
  unidad: number;
  intentos: number;
  mejorPuntaje: number | null;
  evaluacionAprobada: boolean;
  juegoCompletado: boolean;
  recompensa: boolean;
}
interface Respuesta {
  curso: string;
  actual: string;
  niveles: string[];
  libro: {
    nivel: string;
    actualizadoEn: string | null;
    evaluaciones: Evaluacion[];
    proyectos: Proyecto[];
  };
  reglas: {
    criterios: string[];
    puntosMinimos: number;
    entregasBase: number;
    entregasTope: number;
  };
}

const ESTADO: Record<EstadoProyecto, { texto: string; fondo: string; color: string }> = {
  not_submitted: { texto: "Por entregar", fondo: "#eceff1", color: "#455a64" },
  pending_review: { texto: "Por revisar", fondo: "#ede7f6", color: "#4527a0" },
  changes_requested: { texto: "Cambios pedidos", fondo: "#fff3e0", color: "#e65100" },
  approved: { texto: "Aprobado", fondo: "#e8f5e9", color: "#1b5e20" },
};
const nivelBonito = (n: string) => n.charAt(0) + n.slice(1).toLowerCase();
const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const boton: CSSProperties = {
  padding: "0.45rem 0.9rem",
  borderRadius: "0.6rem",
  border: "1px solid #d8dce6",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

export function LibroAlumnoModal({
  childPersonId,
  nombre,
  onCerrar,
  onCambio,
}: {
  childPersonId: string;
  nombre: string;
  onCerrar: () => void;
  /** Algo cambió (revisión, autorización): la lista recalcula sus alertas. */
  onCambio: () => void;
}) {
  const [nivel, setNivel] = useState("");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (n: string) => {
      setError(null);
      const res = await apiFetch(
        `/api/guia/alumnos/${childPersonId}/libro${n !== "" ? `?nivel=${encodeURIComponent(n)}` : ""}`,
      );
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo cargar el libro.");
        return;
      }
      setDatos((await res.json()) as Respuesta);
    },
    [childPersonId],
  );

  useEffect(() => {
    async function inicial() {
      await cargar("");
    }
    void inicial();
  }, [cargar]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const recargar = async () => {
    await cargar(nivel);
    onCambio();
  };

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Libro de ${nombre}`}
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
          maxWidth: "52rem",
          background: "white",
          borderRadius: "1rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.6rem",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e3e7f0",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800 }}>📘 Libro de {nombre}</h2>
            {datos !== null && (
              <p style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                {datos.curso} · {nivelBonito(datos.libro.nivel)}
                {datos.libro.actualizadoEn !== null
                  ? ` · última actividad ${fecha(datos.libro.actualizadoEn)}`
                  : " · todavía no abrió este libro"}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {datos !== null && datos.niveles.length > 1 && (
              <select
                aria-label="Nivel"
                value={datos.libro.nivel}
                onChange={(e) => {
                  setNivel(e.target.value);
                  void cargar(e.target.value);
                }}
                style={{ padding: "0.4rem", borderRadius: "0.5rem", border: "1px solid #d8dce6" }}
              >
                {datos.niveles.map((n) => (
                  <option key={n} value={n}>
                    {nivelBonito(n)}
                    {n === datos.actual ? " (actual)" : ""}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              style={{
                ...boton,
                borderRadius: "50%",
                width: "2.2rem",
                height: "2.2rem",
                padding: 0,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div
          style={{
            padding: "1rem 1.25rem 1.3rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {error !== null && (
            <p role="alert" style={{ color: "#c62828" }}>
              {error}
            </p>
          )}
          {datos === null && error === null && (
            <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
          )}

          {datos !== null && (
            <>
              <section>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 800, marginBottom: "0.4rem" }}>
                  Evaluaciones, juegos y souvenirs
                </h3>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--texto-suave)",
                    marginBottom: "0.4rem",
                  }}
                >
                  Lo que reportó el libro desde el dispositivo del alumno (no es una calificación de
                  la plataforma).
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: "#f6f7fb", textAlign: "left" }}>
                        {[
                          "Unidad",
                          "Intentos",
                          "Mejor puntaje",
                          "Evaluación",
                          "Juego",
                          "Souvenir",
                        ].map((h) => (
                          <th key={h} style={{ padding: "0.45rem 0.6rem", fontSize: "0.72rem" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.libro.evaluaciones.map((u) => (
                        <tr key={u.unidad} style={{ borderTop: "1px solid #eef0f5" }}>
                          <td style={{ padding: "0.45rem 0.6rem" }}>Unidad {u.unidad}</td>
                          <td style={{ padding: "0.45rem 0.6rem" }}>{u.intentos}</td>
                          <td style={{ padding: "0.45rem 0.6rem" }}>
                            {u.mejorPuntaje === null ? "—" : `${String(u.mejorPuntaje)}%`}
                          </td>
                          <td style={{ padding: "0.45rem 0.6rem" }}>
                            {u.evaluacionAprobada
                              ? "✅ Aprobada"
                              : u.intentos > 0
                                ? "⏳ Sin aprobar"
                                : "—"}
                          </td>
                          <td style={{ padding: "0.45rem 0.6rem" }}>
                            {u.juegoCompletado ? "✅" : "—"}
                          </td>
                          <td style={{ padding: "0.45rem 0.6rem" }}>{u.recompensa ? "✅" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 800 }}>Proyectos escritos</h3>
                {datos.libro.proyectos.map((p) => (
                  <TarjetaProyecto
                    key={p.unidad}
                    proyecto={p}
                    reglas={datos.reglas}
                    childPersonId={childPersonId}
                    nivel={datos.libro.nivel}
                    onCambio={recargar}
                  />
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TarjetaProyecto({
  proyecto: p,
  reglas,
  childPersonId,
  nivel,
  onCambio,
}: {
  proyecto: Proyecto;
  reglas: Respuesta["reglas"];
  childPersonId: string;
  nivel: string;
  onCambio: () => Promise<void>;
}) {
  const ultima = p.entregas.at(-1);
  const revisionUltima = ultima?.revisiones.at(-1);
  // Una entrega nueva arranca SIN puntajes: el guía elige cada criterio. Con
  // todo en "2" de entrada, un clic distraído aprobaba con 8/8.
  const [puntajes, setPuntajes] = useState<(number | null)[]>(
    revisionUltima?.puntajes ?? [null, null, null, null],
  );
  const [comentario, setComentario] = useState(revisionUltima?.comentario ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(p.estado === "pending_review");

  const completos = puntajes.every((n) => n !== null);
  const total = puntajes.reduce<number>((a, b) => a + (b ?? 0), 0);
  const alcanza =
    completos && puntajes.every((n) => (n ?? 0) >= 1) && total >= reglas.puntosMinimos;
  const est = ESTADO[p.estado];
  const sinOportunidades =
    p.estado === "changes_requested" &&
    p.entregas.length >= p.limite &&
    p.limite < reglas.entregasTope;

  async function enviar(decision: Decision) {
    if (ultima === undefined) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/guia/proyectos/${ultima.id}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, puntajes, comentario: comentario.trim() || null }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar la revisión.");
        return;
      }
      setRevisando(false);
      await onCambio();
    } finally {
      setOcupado(false);
    }
  }

  async function autorizar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/guia/alumnos/${childPersonId}/libro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nivel, unidad: p.unidad, maximo: p.limite + 1 }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo autorizar otra entrega.");
        return;
      }
      await onCambio();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <article
      style={{ border: "1px solid #e3e7f0", borderRadius: "0.8rem", padding: "0.8rem 0.9rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <strong>Unidad {p.unidad}</strong>
        <span style={{ fontSize: "0.78rem" }}>
          <span
            style={{
              padding: "0.12rem 0.5rem",
              borderRadius: "999px",
              background: est.fondo,
              color: est.color,
              fontWeight: 700,
            }}
          >
            {est.texto}
          </span>{" "}
          · {p.entregas.length}/{p.limite} entregas
          {p.conBorrador && p.estado !== "approved" && " · escribiendo un borrador"}
        </span>
      </div>

      {ultima === undefined ? (
        <p style={{ fontSize: "0.82rem", color: "var(--texto-suave)", marginTop: "0.4rem" }}>
          Aún no entrega este proyecto.
        </p>
      ) : (
        <>
          <p style={{ fontSize: "0.75rem", color: "var(--texto-suave)", marginTop: "0.5rem" }}>
            Entrega {ultima.intento} · recibida {fecha(ultima.recibidoEn)}
          </p>
          <p
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              background: "#f8f9fc",
              border: "1px solid #eef0f5",
              borderRadius: "0.6rem",
              padding: "0.7rem",
              fontSize: "0.88rem",
              marginTop: "0.3rem",
            }}
          >
            {ultima.texto}
          </p>

          {revisionUltima !== undefined && !revisando && (
            <div style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
              <strong>
                {revisionUltima.decision === "approved" ? "Aprobado" : "Pidió cambios"}
              </strong>{" "}
              · {revisionUltima.puntajes.reduce((a, b) => a + b, 0)}/8 (
              {revisionUltima.puntajes.join(" · ")}) · {revisionUltima.revisadoPor},{" "}
              {fecha(revisionUltima.revisadoEn)}
              {revisionUltima.comentario !== "" && (
                <p style={{ color: "var(--texto-suave)", marginTop: "0.2rem" }}>
                  “{revisionUltima.comentario}”
                </p>
              )}
              <button
                type="button"
                onClick={() => setRevisando(true)}
                style={{ ...boton, marginTop: "0.4rem", fontSize: "0.78rem" }}
              >
                ✏️ Cambiar revisión
              </button>
            </div>
          )}

          {revisando && (
            <div
              style={{
                marginTop: "0.6rem",
                padding: "0.7rem",
                borderRadius: "0.6rem",
                background: "#f6f4fd",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "0.35rem 0.8rem",
                  alignItems: "center",
                  fontSize: "0.82rem",
                }}
              >
                {reglas.criterios.map((c, i) => (
                  <label key={c} style={{ display: "contents" }}>
                    <span>
                      {i + 1}. {c}
                    </span>
                    <select
                      value={puntajes[i] ?? ""}
                      onChange={(e) =>
                        setPuntajes((prev) =>
                          prev.map((v, j) =>
                            j === i ? (e.target.value === "" ? null : Number(e.target.value)) : v,
                          ),
                        )
                      }
                      style={{
                        padding: "0.25rem",
                        borderRadius: "0.4rem",
                        border: "1px solid #d8dce6",
                      }}
                    >
                      <option value="">Elegir…</option>
                      <option value={0}>0 · aún no logrado</option>
                      <option value={1}>1 · en desarrollo</option>
                      <option value={2}>2 · logrado</option>
                    </select>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: "0.78rem", marginTop: "0.4rem" }}>
                Total <strong>{total}/8</strong>
                {!completos
                  ? " · califica los cuatro criterios"
                  : alcanza
                    ? " · alcanza para aprobar"
                    : ` · para aprobar hacen falta ${String(reglas.puntosMinimos)}/8 y ningún 0`}
              </p>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Observaciones para el alumno (las verá en su libro)"
                style={{
                  width: "100%",
                  marginTop: "0.4rem",
                  padding: "0.5rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #d8dce6",
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.4rem" }}
              >
                <button
                  type="button"
                  disabled={ocupado || !alcanza}
                  onClick={() => void enviar("approved")}
                  style={{
                    ...boton,
                    border: "none",
                    background: alcanza ? "#2e7d32" : "#c8e6c9",
                    color: "white",
                  }}
                >
                  ✅ Aprobar
                </button>
                <button
                  type="button"
                  disabled={ocupado || !completos}
                  onClick={() => void enviar("changes_requested")}
                  style={{ ...boton, border: "none", background: "#ef6c00", color: "white" }}
                >
                  ↩ Pedir cambios
                </button>
                {revisionUltima !== undefined && (
                  <button type="button" onClick={() => setRevisando(false)} style={boton}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {sinOportunidades && (
        <p style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Usó sus {p.limite} oportunidades.{" "}
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void autorizar()}
            style={{ ...boton, fontSize: "0.78rem" }}
          >
            ➕ Autorizar una entrega más
          </button>
        </p>
      )}
      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontSize: "0.8rem", marginTop: "0.4rem" }}>
          {error}
        </p>
      )}

      {p.entregas.length > 1 && (
        <details style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
          <summary style={{ cursor: "pointer" }}>
            Entregas anteriores ({p.entregas.length - 1})
          </summary>
          {p.entregas.slice(0, -1).map((e) => {
            const r = e.revisiones.at(-1);
            return (
              <div key={e.id} style={{ borderTop: "1px solid #eef0f5", padding: "0.4rem 0" }}>
                <div style={{ color: "var(--texto-suave)" }}>
                  Entrega {e.intento} · {fecha(e.recibidoEn)}
                  {r !== undefined &&
                    ` · ${r.decision === "approved" ? "aprobada" : "cambios pedidos"} ${String(r.puntajes.reduce((a, b) => a + b, 0))}/8`}
                </div>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.texto}</p>
                {r !== undefined && r.comentario !== "" && (
                  <p style={{ color: "var(--texto-suave)" }}>“{r.comentario}”</p>
                )}
              </div>
            );
          })}
        </details>
      )}
    </article>
  );
}
