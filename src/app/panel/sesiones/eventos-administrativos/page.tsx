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
  asistieron: number;
  marcados: number;
  audiencia: string[];
}

interface Asistente {
  guiaUserId: string;
  username: string;
  nombre: string | null;
  asistio: boolean | null;
  marcadoEn: string | null;
}

interface TipoAdmin {
  valor: string;
  etiqueta: string;
}

const PAISES = ["CL", "CO", "EC", "PE"];

const COLOR_TIPO: Record<string, string> = {
  MEETING: "#e65100",
  TRAINING: "#00695c",
  OBSERVATION: "#6a1b9a",
  DEVELOPMENT: "#1565c0",
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
  const [tipo, setTipo] = useState("");
  const [pais, setPais] = useState("");
  // El vocabulario lo define el dominio y lo sirve la API; copiarlo aquí
  // dejaría el filtro desfasado al añadir un tipo.
  const [tipos, setTipos] = useState<TipoAdmin[]>([]);

  // Modal de lista: evento elegido, su audiencia y las marcas sin guardar.
  const [lista, setLista] = useState<EventoAdmin | null>(null);
  const [asistentes, setAsistentes] = useState<Asistente[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams({ from: desde, to: hasta });
    if (tipo !== "") qs.set("tipo", tipo);
    if (pais !== "") qs.set("pais", pais);
    const res = await apiFetch(`/api/scheduling/eventos-admin?${qs.toString()}`);
    if (!res.ok) {
      setError("No se pudieron cargar los eventos administrativos.");
      return;
    }
    setError(null);
    const d = (await res.json()) as { eventos: EventoAdmin[]; tipos: TipoAdmin[] };
    setEventos(d.eventos);
    setTipos(d.tipos);
  }, [desde, hasta, tipo, pais]);

  useEffect(() => {
    async function inicio() {
      await cargar();
    }
    void inicio();
  }, [cargar]);

  function hora(iso: string): string {
    return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }

  async function abrirLista(e: EventoAdmin) {
    setLista(e);
    setAsistentes(null);
    setErrorLista(null);
    const res = await apiFetch(`/api/scheduling/eventos-admin/${e.id}/asistencia`);
    if (!res.ok) {
      setErrorLista("No se pudo cargar la lista.");
      return;
    }
    setAsistentes(((await res.json()) as { audiencia: Asistente[] }).audiencia);
  }

  /** Marca local; nada viaja hasta guardar. */
  function alternar(guiaUserId: string, asistio: boolean | null) {
    setAsistentes((prev) =>
      (prev ?? []).map((a) => (a.guiaUserId === guiaUserId ? { ...a, asistio } : a)),
    );
  }

  async function guardarLista() {
    if (lista === null || asistentes === null) return;
    setGuardando(true);
    setErrorLista(null);
    try {
      const res = await apiFetch(`/api/scheduling/eventos-admin/${lista.id}/asistencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marcas: asistentes.map((a) => ({ guiaUserId: a.guiaUserId, asistio: a.asistio })),
        }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json();
        setErrorLista(c.error?.message ?? "No se pudo guardar la lista.");
        return;
      }
      setLista(null);
      await cargar();
    } finally {
      setGuardando(false);
    }
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
        <div>
          <label style={rotulo} htmlFor="e-tipo">
            Tipo
          </label>
          <select id="e-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} style={campo}>
            <option value="">Todos</option>
            {tipos.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={rotulo} htmlFor="e-pais">
            País
          </label>
          <select id="e-pais" value={pais} onChange={(e) => setPais(e.target.value)} style={campo}>
            <option value="">Todos</option>
            {PAISES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
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
              <th style={celda}>Asistencia</th>
              <th style={celda} />
            </tr>
          </thead>
          <tbody>
            {eventos !== null && eventos.length === 0 && (
              <tr>
                <td
                  colSpan={8}
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
                  <td style={celda}>
                    {e.marcados === 0 ? (
                      <span style={{ color: "var(--texto-suave)" }}>Sin pasar lista</span>
                    ) : (
                      <>
                        <strong>{e.asistieron}</strong> de {e.guias}
                      </>
                    )}
                  </td>
                  <td style={{ ...celda, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => void abrirLista(e)}
                      style={{
                        padding: "0.35rem 0.8rem",
                        borderRadius: "0.5rem",
                        border: "none",
                        background: "var(--lgs-azul)",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "0.78rem",
                        marginRight: "0.5rem",
                      }}
                    >
                      Pasar lista
                    </button>
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
                    <td colSpan={8} style={{ ...celda, paddingBottom: "1rem" }}>
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

      {lista !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lista de asistencia"
          onClick={() => {
            if (!guardando) setLista(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(8,11,24,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "32rem",
              background: "white",
              borderRadius: "1rem",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.8rem",
            }}
          >
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>Lista de asistencia</h2>
            <p style={{ fontSize: "0.88rem", margin: 0 }}>
              {lista.tipo} · {lista.titulo ?? "Sin título"} · {lista.fecha} {hora(lista.startsAt)}
            </p>

            {asistentes === null ? (
              <p style={{ color: "var(--texto-suave)" }}>Cargando la audiencia…</p>
            ) : asistentes.length === 0 ? (
              <p style={{ color: "var(--texto-suave)" }}>Este evento no tiene audiencia.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {asistentes.map((a2) => (
                  <div
                    key={a2.guiaUserId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.6rem",
                      padding: "0.5rem 0.6rem",
                      border: "1px solid #eef1f7",
                      borderRadius: "0.6rem",
                    }}
                  >
                    <span style={{ fontSize: "0.88rem" }}>
                      <strong>{a2.nombre ?? a2.username}</strong>
                      {a2.nombre !== null && (
                        <span style={{ color: "var(--texto-suave)" }}> · {a2.username}</span>
                      )}
                    </span>
                    <span style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
                      {[
                        { v: true, txt: "Asistió", bg: "var(--lgs-verde)" },
                        { v: false, txt: "No", bg: "#c62828" },
                        { v: null, txt: "—", bg: "#9aa1b2" },
                      ].map((op) => (
                        <button
                          key={String(op.v)}
                          type="button"
                          onClick={() => alternar(a2.guiaUserId, op.v)}
                          style={{
                            padding: "0.25rem 0.6rem",
                            borderRadius: "0.5rem",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.76rem",
                            fontWeight: 700,
                            background: a2.asistio === op.v ? op.bg : "#eef1f7",
                            color: a2.asistio === op.v ? "white" : "#5a6172",
                          }}
                        >
                          {op.txt}
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: "0.74rem", color: "var(--texto-suave)", margin: 0 }}>
              “—” deja al guía sin marcar, que no es lo mismo que “no asistió”.
            </p>

            {errorLista !== null && (
              <p role="alert" style={{ color: "#c62828", fontWeight: 600, fontSize: "0.85rem" }}>
                {errorLista}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setLista(null)}
                disabled={guardando}
                style={{
                  padding: "0.6rem 1.1rem",
                  borderRadius: "0.6rem",
                  border: "1.5px solid #e0e4ee",
                  background: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void guardarLista()}
                disabled={guardando || asistentes === null || asistentes.length === 0}
                style={{
                  padding: "0.6rem 1.1rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "var(--lgs-verde)",
                  color: "white",
                  fontWeight: 700,
                  cursor: guardando ? "wait" : "pointer",
                }}
              >
                {guardando ? "Guardando…" : "Guardar lista"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
