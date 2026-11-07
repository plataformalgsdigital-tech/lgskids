"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";
import { resumenHorario } from "@/ui/horario";
import { LibroAlumnoModal } from "./LibroAlumnoModal";

/**
 * MIS ALUMNOS POR CURSO (2026-11-06), como el "Mis alumnos" del panel de guías
 * de MOSAICO: un salón a la vez, sus cifras y cada niño con su asistencia,
 * faltas recientes, casos y libro, primero los que tienen alertas. Desde la
 * fila se abre su LIBRO: lo que reportó de evaluaciones y juegos, y sus
 * proyectos para revisar.
 */

interface Alumno {
  childPersonId: string;
  nombres: string;
  apellidos: string;
  docNumero: string;
  username: string | null;
  presentes: number;
  marcadas: number;
  asistencia: number | null;
  ultimaAsistencia: string | null;
  faltasRecientes: number;
  casosAbiertos: number;
  evaluacionesAprobadas: number;
  proyectosAprobados: number;
  proyectosPorRevisar: number;
  libroActualizado: string | null;
  alertas: string[];
}

interface Salon {
  id: string;
  nombre: string;
  campania: string;
  curso: string;
  pais: string;
  horario: { tipo: string; diaSemana: number; horaLocal: string; duracionMin: number }[];
  sesionesTotal: number;
  sesionesDictadas: number;
  alumnos: Alumno[];
}

interface Respuesta {
  guia: { id: string; nombre: string | null };
  salones: Salon[];
  guias: { id: string; nombre: string }[];
}

const tarjeta: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.8rem",
  padding: "0.8rem 0.9rem",
  background: "white",
};
const chip = (fondo: string, color: string): CSSProperties => ({
  display: "inline-block",
  padding: "0.12rem 0.5rem",
  borderRadius: "999px",
  background: fondo,
  color,
  fontSize: "0.72rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
});
const COLOR_ALERTA: Record<string, [string, string]> = {
  "Proyecto por revisar": ["#ede7f6", "#4527a0"],
  "Caso abierto": ["#ffebee", "#b71c1c"],
  "Faltas recientes": ["#fff3e0", "#e65100"],
  "Asistencia baja": ["#fff8e1", "#8d6e00"],
};

const fechaCorta = (iso: string | null) =>
  iso === null
    ? "—"
    : new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es", {
        day: "numeric",
        month: "short",
      });

export default function MisAlumnosPage() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guia, setGuia] = useState("");
  const [salonId, setSalonId] = useState<string | null>(null);
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [libroDe, setLibroDe] = useState<Alumno | null>(null);

  const cargar = useCallback(async (guiaUserId: string) => {
    setError(null);
    const res = await apiFetch(
      `/api/guia/alumnos${guiaUserId !== "" ? `?guia=${encodeURIComponent(guiaUserId)}` : ""}`,
    );
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudieron cargar tus alumnos.");
      setDatos(null);
      return;
    }
    const d = (await res.json()) as Respuesta;
    setDatos(d);
    setSalonId((actual) =>
      actual !== null && d.salones.some((s) => s.id === actual)
        ? actual
        : (d.salones[0]?.id ?? null),
    );
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar("");
    }
    void inicial();
  }, [cargar]);

  const salon = datos?.salones.find((s) => s.id === salonId) ?? null;
  const alumnos = useMemo(() => {
    const lista = [...(salon?.alumnos ?? [])].sort(
      (a, b) => b.alertas.length - a.alertas.length || a.apellidos.localeCompare(b.apellidos),
    );
    return soloAlertas ? lista.filter((a) => a.alertas.length > 0) : lista;
  }, [salon, soloAlertas]);

  const kpis = useMemo(() => {
    const todos = salon?.alumnos ?? [];
    const conMarca = todos.filter((a) => a.asistencia !== null);
    return {
      activos: todos.length,
      conAlertas: todos.filter((a) => a.alertas.length > 0).length,
      asistencia:
        conMarca.length > 0
          ? Math.round(conMarca.reduce((n, a) => n + (a.asistencia ?? 0), 0) / conMarca.length)
          : null,
      porRevisar: todos.reduce((n, a) => n + a.proyectosPorRevisar, 0),
      casos: todos.reduce((n, a) => n + a.casosAbiertos, 0),
    };
  }, [salon]);

  function exportar() {
    if (salon === null) return;
    descargarCsv(
      `mis-alumnos-${salon.nombre.replace(/\s+/g, "-")}.csv`,
      [
        "Alumno",
        "Documento",
        "Usuario",
        "Asistencia %",
        "Asistidas",
        "Marcadas",
        "Última asistencia",
        "Faltas recientes",
        "Casos abiertos",
        "Evaluaciones aprobadas (libro)",
        "Proyectos aprobados",
        "Proyectos por revisar",
        "Alertas",
      ],
      (salon.alumnos ?? []).map((a) => [
        `${a.apellidos}, ${a.nombres}`,
        a.docNumero,
        a.username ?? "",
        a.asistencia ?? "",
        a.presentes,
        a.marcadas,
        a.ultimaAsistencia ?? "",
        a.faltasRecientes,
        a.casosAbiertos,
        a.evaluacionesAprobadas,
        a.proyectosAprobados,
        a.proyectosPorRevisar,
        a.alertas.join(" · "),
      ]),
    );
  }

  return (
    <main style={{ padding: "1.5rem 1.25rem", maxWidth: "76rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "var(--texto-suave)",
            }}
          >
            PANEL DEL GUÍA
          </p>
          <h1 style={{ fontSize: "1.6rem", margin: "0.1rem 0" }}>Mis alumnos por curso</h1>
          <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem" }}>
            {datos?.guia.nombre ?? ""}
            {datos !== null &&
              ` · Corte al ${new Date().toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {datos !== null && datos.guias.length > 0 && (
            <select
              aria-label="Guía"
              value={guia === "" ? datos.guia.id : guia}
              onChange={(e) => {
                setGuia(e.target.value);
                setSalonId(null);
                void cargar(e.target.value);
              }}
              style={{
                padding: "0.45rem 0.6rem",
                borderRadius: "0.5rem",
                border: "1px solid #d8dce6",
              }}
            >
              {!datos.guias.some((g) => g.id === datos.guia.id) && (
                <option value={datos.guia.id}>{datos.guia.nombre ?? "Yo"}</option>
              )}
              {datos.guias.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={exportar}
            disabled={salon === null}
            style={{
              padding: "0.45rem 0.9rem",
              borderRadius: "0.6rem",
              border: "1px solid #d8dce6",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", marginTop: "1rem" }}>
          {error}
        </p>
      )}
      {datos === null && error === null && (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>Cargando…</p>
      )}
      {datos !== null && datos.salones.length === 0 && (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>
          No hay salones activos asignados a este guía.
        </p>
      )}

      {datos !== null && datos.salones.length > 0 && (
        <>
          {/* Un salón a la vez: tarjetas como pestañas. */}
          <div
            role="tablist"
            aria-label="Salones"
            style={{
              display: "flex",
              gap: "0.6rem",
              overflowX: "auto",
              margin: "1rem 0",
              paddingBottom: "0.3rem",
            }}
          >
            {datos.salones.map((s) => {
              const activo = s.id === salonId;
              const conAlertas = s.alumnos.filter((a) => a.alertas.length > 0).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => setSalonId(s.id)}
                  style={{
                    flex: "0 0 auto",
                    textAlign: "left",
                    minWidth: "15rem",
                    padding: "0.65rem 0.8rem",
                    borderRadius: "0.8rem",
                    border: activo ? "2px solid #4527a0" : "1px solid #e3e7f0",
                    background: activo ? "#4527a0" : "white",
                    color: activo ? "white" : "inherit",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "0.85rem" }}>
                      {s.curso} · {s.nombre.replace(/^(JUNIOR|YOUNGSTER)\s+/i, "")}
                    </strong>
                    {conAlertas > 0 && (
                      <span style={chip("#ffebee", "#b71c1c")}>{conAlertas} con alertas</span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.72rem", opacity: 0.85, marginTop: "0.2rem" }}>
                    {s.campania} · {resumenHorario(s.horario)} · {s.alumnos.length} alumnos
                  </div>
                </button>
              );
            })}
          </div>

          {salon !== null && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
                  gap: "0.6rem",
                }}
              >
                {[
                  ["Alumnos activos", String(kpis.activos), resumenHorario(salon.horario)],
                  [
                    "Con alertas",
                    String(kpis.conAlertas),
                    kpis.activos > 0
                      ? `${String(Math.round((kpis.conAlertas / kpis.activos) * 100))}% del salón`
                      : "",
                  ],
                  [
                    "Asistencia media",
                    kpis.asistencia === null ? "—" : `${String(kpis.asistencia)}%`,
                    "sobre clases marcadas",
                  ],
                  [
                    "Avance del curso",
                    `${String(salon.sesionesDictadas)}/${String(salon.sesionesTotal)}`,
                    "sesiones dictadas",
                  ],
                  ["Proyectos por revisar", String(kpis.porRevisar), "del libro"],
                  ["Casos abiertos", String(kpis.casos), "en gestión"],
                ].map(([t, v, s]) => (
                  <div key={t} style={tarjeta}>
                    <div style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>{t}</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{v}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--texto-suave)" }}>{s}</div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  margin: "1rem 0 0.5rem",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <p style={{ fontSize: "0.85rem" }}>
                  <strong>{salon.nombre}</strong> · {alumnos.length} de {salon.alumnos.length}{" "}
                  alumnos · primero los que tienen alertas
                </p>
                <label
                  style={{
                    display: "flex",
                    gap: "0.4rem",
                    alignItems: "center",
                    fontSize: "0.85rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={soloAlertas}
                    onChange={(e) => setSoloAlertas(e.target.checked)}
                  />
                  Solo con alertas
                </label>
              </div>

              <div
                style={{ overflowX: "auto", border: "1px solid #e3e7f0", borderRadius: "0.8rem" }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "#f6f7fb", textAlign: "left" }}>
                      {[
                        "Alumno",
                        "Asistencia",
                        "Faltas recientes",
                        "Casos",
                        "Libro",
                        "Alertas",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.6rem 0.7rem",
                            fontSize: "0.72rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alumnos.map((a) => (
                      <tr key={a.childPersonId} style={{ borderTop: "1px solid #eef0f5" }}>
                        <td style={{ padding: "0.6rem 0.7rem" }}>
                          <Link
                            href={`/panel/personas/${a.childPersonId}`}
                            style={{ fontWeight: 700 }}
                          >
                            {a.apellidos}, {a.nombres}
                          </Link>
                          <div style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>
                            {a.username ?? a.docNumero} · Últ. asistencia{" "}
                            {fechaCorta(a.ultimaAsistencia)}
                          </div>
                        </td>
                        <td style={{ padding: "0.6rem 0.7rem", minWidth: "9rem" }}>
                          <strong
                            style={{
                              color:
                                a.asistencia !== null && a.asistencia < 80 ? "#c62828" : "#1b5e20",
                            }}
                          >
                            {a.asistencia === null ? "—" : `${String(a.asistencia)}%`}
                          </strong>{" "}
                          <span style={{ color: "var(--texto-suave)" }}>
                            {a.presentes}/{a.marcadas}
                          </span>
                          <div
                            style={{
                              height: "0.3rem",
                              background: "#eef0f5",
                              borderRadius: "1rem",
                              marginTop: "0.25rem",
                            }}
                          >
                            <div
                              style={{
                                width: `${String(a.asistencia ?? 0)}%`,
                                height: "100%",
                                borderRadius: "1rem",
                                background:
                                  a.asistencia !== null && a.asistencia < 80
                                    ? "#e53935"
                                    : "#2e7d32",
                              }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: "0.6rem 0.7rem" }}>
                          {a.faltasRecientes > 0
                            ? `${String(a.faltasRecientes)} de 4`
                            : "Sin faltas"}
                        </td>
                        <td style={{ padding: "0.6rem 0.7rem" }}>
                          {a.casosAbiertos > 0 ? (
                            <span style={chip("#ffebee", "#b71c1c")}>
                              {a.casosAbiertos} abierto{a.casosAbiertos === 1 ? "" : "s"}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ padding: "0.6rem 0.7rem", fontSize: "0.75rem" }}>
                          {a.libroActualizado === null &&
                          a.proyectosAprobados + a.proyectosPorRevisar === 0 ? (
                            <span style={{ color: "var(--texto-suave)" }}>Sin actividad</span>
                          ) : (
                            <>
                              <div>Evaluaciones aprobadas: {a.evaluacionesAprobadas}</div>
                              <div>
                                Proyectos: {a.proyectosAprobados} aprobados
                                {a.proyectosPorRevisar > 0 && (
                                  <strong style={{ color: "#4527a0" }}>
                                    {" "}
                                    · {a.proyectosPorRevisar} por revisar
                                  </strong>
                                )}
                              </div>
                              <div style={{ color: "var(--texto-suave)" }}>
                                Act. {fechaCorta(a.libroActualizado)}
                              </div>
                            </>
                          )}
                        </td>
                        <td style={{ padding: "0.6rem 0.7rem" }}>
                          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                            {a.alertas.length === 0
                              ? "—"
                              : a.alertas.map((t) => {
                                  const [f, c] = COLOR_ALERTA[t] ?? ["#eceff1", "#37474f"];
                                  return (
                                    <span key={t} style={chip(f, c)}>
                                      {t}
                                    </span>
                                  );
                                })}
                          </div>
                        </td>
                        <td style={{ padding: "0.6rem 0.7rem" }}>
                          <button
                            type="button"
                            onClick={() => setLibroDe(a)}
                            style={{
                              padding: "0.35rem 0.7rem",
                              borderRadius: "0.5rem",
                              border: "none",
                              background: a.proyectosPorRevisar > 0 ? "#4527a0" : "#e8eaf6",
                              color: a.proyectosPorRevisar > 0 ? "white" : "#283593",
                              fontWeight: 700,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            📘 Libro
                          </button>
                        </td>
                      </tr>
                    ))}
                    {alumnos.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: "1rem", color: "var(--texto-suave)" }}>
                          {soloAlertas
                            ? "Ningún alumno con alertas."
                            : "Este salón no tiene alumnos activos."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {libroDe !== null && (
        <LibroAlumnoModal
          childPersonId={libroDe.childPersonId}
          nombre={`${libroDe.nombres} ${libroDe.apellidos}`}
          onCerrar={() => setLibroDe(null)}
          onCambio={() => void cargar(guia)}
        />
      )}
    </main>
  );
}
