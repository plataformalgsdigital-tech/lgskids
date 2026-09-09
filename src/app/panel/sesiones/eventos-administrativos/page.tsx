"use client";

import { Fragment, useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Eventos ADMINISTRATIVOS: reuniones, capacitaciones y talleres internos cuya
 * audiencia son GUÍAS, no niños.
 *
 * Viven en su propia tabla, no entre las sesiones: ahí arrastrarían lista de
 * matriculados, asistencia y progresión, y aparecerían en la agenda de los
 * alumnos. Por eso esta pantalla es la única vista completa que existe de
 * ellos — en el calendario cada guía solo ve los suyos, en naranja.
 *
 * Se CREAN desde el calendario (botón "Evento Administrativo", `eventos.crear`).
 * Aquí se consultan.
 */

interface EventoAdmin {
  id: string;
  tipo: string;
  titulo: string | null;
  fecha: string;
  startsAt: string;
  duracionMin: number;
  campania: string | null;
  curso: string | null;
  nivel: string | null;
  observaciones: string | null;
  pais: string | null;
  guias: number;
  audiencia: string[];
}

const COLOR_TIPO: Record<string, string> = {
  SESION: "#e65100",
  CLUB: "#6a1b9a",
  TALLER: "#00695c",
};

const campo: CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.85rem",
  fontFamily: "inherit",
  background: "white",
};
const rotulo: CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--texto-suave)",
  marginBottom: "0.15rem",
};
const celda: CSSProperties = { padding: "0.55rem 0.6rem", verticalAlign: "top" };

/** Primer y último día del mes actual, que es el rango con el que se abre. */
function mesActual(): { desde: string; hasta: string } {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const iso = (d: Date) =>
    `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { desde: iso(new Date(y, m, 1)), hasta: iso(new Date(y, m + 1, 0)) };
}

export default function EventosAdministrativosPage() {
  const inicial = mesActual();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [eventos, setEventos] = useState<EventoAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch(
      `/api/scheduling/eventos-admin?from=${encodeURIComponent(desde)}&to=${encodeURIComponent(hasta)}`,
    );
    if (!res.ok) {
      setError("No se pudieron cargar los eventos administrativos.");
      return;
    }
    setError(null);
    setEventos(((await res.json()) as { eventos: EventoAdmin[] }).eventos);
  }, [desde, hasta]);

  useEffect(() => {
    async function inicio() {
      await cargar();
    }
    void inicio();
  }, [cargar]);

  function hora(iso: string): string {
    return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Eventos administrativos</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        Reuniones, capacitaciones y talleres internos. La audiencia son <strong>guías</strong>, no
        niños: no llevan matriculados ni asistencia, y no aparecen en la agenda de los alumnos. Se
        crean desde el <strong>Calendario</strong>, con el botón “Evento Administrativo”.
      </p>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, marginTop: "0.8rem" }}>
          {error}
        </p>
      )}

      <section
        style={{
          marginTop: "1.2rem",
          display: "flex",
          gap: "0.7rem",
          alignItems: "flex-end",
          flexWrap: "wrap",
          background: "white",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "0.9rem 1rem",
        }}
      >
        <div>
          <label style={rotulo} htmlFor="e-desde">
            Desde
          </label>
          <input
            id="e-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            style={campo}
          />
        </div>
        <div>
          <label style={rotulo} htmlFor="e-hasta">
            Hasta
          </label>
          <input
            id="e-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            style={campo}
          />
        </div>
        <span style={{ fontSize: "0.82rem", color: "var(--texto-suave)", paddingBottom: "0.5rem" }}>
          {eventos === null
            ? "Cargando…"
            : `${String(eventos.length)} evento${eventos.length === 1 ? "" : "s"}`}
        </span>
      </section>

      <section
        style={{
          marginTop: "0.8rem",
          background: "white",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          overflowX: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#f7f9fd" }}>
              <th style={celda}>Fecha</th>
              <th style={celda}>Hora</th>
              <th style={celda}>Tipo</th>
              <th style={celda}>Título</th>
              <th style={celda}>País</th>
              <th style={celda}>Audiencia</th>
              <th style={celda} />
            </tr>
          </thead>
          <tbody>
            {eventos !== null && eventos.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ ...celda, color: "var(--texto-suave)", padding: "1.5rem" }}
                >
                  No hay eventos administrativos en ese rango.
                </td>
              </tr>
            )}
            {(eventos ?? []).map((e) => (
              <Fragment key={e.id}>
                <tr style={{ borderTop: "1px solid #eef1f7" }}>
                  <td style={celda}>{e.fecha}</td>
                  <td style={celda}>
                    {hora(e.startsAt)}
                    <span style={{ color: "var(--texto-suave)" }}> · {String(e.duracionMin)}′</span>
                  </td>
                  <td style={celda}>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "0.12rem 0.5rem",
                        borderRadius: "1rem",
                        background: "#fff3e0",
                        color: COLOR_TIPO[e.tipo] ?? "#e65100",
                      }}
                    >
                      {e.tipo}
                    </span>
                  </td>
                  <td style={celda}>{e.titulo ?? "—"}</td>
                  <td style={celda}>{e.pais ?? "—"}</td>
                  <td style={celda}>
                    {e.guias} guía{e.guias === 1 ? "" : "s"}
                  </td>
                  <td style={{ ...celda, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => setAbierto(abierto === e.id ? null : e.id)}
                      style={{
                        border: "none",
                        background: "none",
                        color: "var(--lgs-azul)",
                        cursor: "pointer",
                        font: "inherit",
                        textDecoration: "underline",
                      }}
                    >
                      {abierto === e.id ? "Ocultar" : "Ver detalle"}
                    </button>
                  </td>
                </tr>
                {abierto === e.id && (
                  <tr style={{ background: "#fbfcff" }}>
                    <td colSpan={7} style={{ ...celda, paddingBottom: "1rem" }}>
                      <div style={{ display: "grid", gap: "0.5rem", maxWidth: "48rem" }}>
                        <div>
                          <span style={rotulo}>Quiénes lo ven</span>
                          <span>
                            {e.audiencia.length > 0 ? e.audiencia.join(" · ") : "Sin audiencia"}
                          </span>
                        </div>
                        {(e.campania !== null || e.curso !== null || e.nivel !== null) && (
                          <div>
                            <span style={rotulo}>Contexto</span>
                            <span>
                              {[e.campania, e.curso, e.nivel].filter((x) => x !== null).join(" · ")}
                            </span>
                          </div>
                        )}
                        {e.observaciones !== null && e.observaciones !== "" && (
                          <div>
                            <span style={rotulo}>Observaciones</span>
                            <span>{e.observaciones}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
