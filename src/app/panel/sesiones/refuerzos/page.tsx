"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Bandeja de REFUERZOS: el guía pide repetir una sesión y coordinación decide.
 *
 * Autorizar crea una clase EXTRA. NO extiende el curso ni mueve `final_curso`
 * (regla 1), y no altera el avance del alumno, que se deriva de evaluaciones y
 * no de sesiones dictadas (regla 4). Por eso hay que dar fecha y hora: el
 * horario regular del salón ya está ocupado.
 */

interface Refuerzo {
  id: string;
  sessionId: string;
  campania: string;
  cursoTipo: string;
  classroomId: string;
  pais: string | null;
  salon: string;
  guia: string | null;
  guiaUserId: string | null;
  fechaEvento: string;
  numero: number;
  nivel: string | null;
  motivo: string;
  repetirLeccion: boolean;
  leccionRef: string | null;
  solicitante: string | null;
  solicitadoEn: string;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  notaResolucion: string | null;
  fechaRefuerzo: string | null;
}

const ESTADOS = ["PENDIENTE", "APROBADA", "RECHAZADA", "TODAS"] as const;

const COLOR_ESTADO: Record<Refuerzo["estado"], { bg: string; c: string }> = {
  PENDIENTE: { bg: "#fff3e0", c: "#e65100" },
  APROBADA: { bg: "#e8f5e9", c: "#1b5e20" },
  RECHAZADA: { bg: "#eceff1", c: "#455a64" },
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

function soloFecha(iso: string): string {
  return iso.slice(0, 10);
}

/** Hoy en la zona del navegador, YYYY-MM-DD, para sugerir la fecha. */
function hoyLocal(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${String(d.getFullYear())}-${mes}-${dia}`;
}

export default function RefuerzosPage() {
  const [filas, setFilas] = useState<Refuerzo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [estado, setEstado] = useState<(typeof ESTADOS)[number]>("PENDIENTE");
  const [guia, setGuia] = useState("");
  const [curso, setCurso] = useState("");
  const [salon, setSalon] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [sel, setSel] = useState<Refuerzo | null>(null);
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [duracion, setDuracion] = useState(60);
  const [ocupado, setOcupado] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams({ estado });
    if (guia !== "") qs.set("guia", guia);
    if (curso !== "") qs.set("curso", curso);
    if (salon !== "") qs.set("salon", salon);
    if (desde !== "") qs.set("desde", desde);
    if (hasta !== "") qs.set("hasta", hasta);
    const res = await apiFetch(`/api/scheduling/refuerzos?${qs.toString()}`);
    if (!res.ok) {
      setError("No se pudo cargar la bandeja de refuerzos.");
      return;
    }
    setError(null);
    setFilas(((await res.json()) as { refuerzos: Refuerzo[] }).refuerzos);
  }, [estado, guia, curso, salon, desde, hasta]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  // Los selectores se arman con lo que trajo la consulta: no hace falta un
  // endpoint aparte de guías ni de salones.
  const opciones = useMemo(() => {
    const guias = new Map<string, string>();
    const salones = new Map<string, string>();
    const cursos = new Set<string>();
    for (const f of filas ?? []) {
      if (f.guiaUserId !== null && f.guia !== null && f.guia !== "")
        guias.set(f.guiaUserId, f.guia);
      salones.set(f.classroomId, `${f.cursoTipo} · ${f.salon}`);
      cursos.add(f.cursoTipo);
    }
    return { guias: [...guias], salones: [...salones], cursos: [...cursos].sort() };
  }, [filas]);

  function abrir(f: Refuerzo) {
    setSel(f);
    setNota("");
    setErrorModal(null);
    setFecha(hoyLocal());
    setHora("");
    setDuracion(60);
  }

  async function resolver(aprobar: boolean) {
    if (sel === null) return;
    setOcupado(true);
    setErrorModal(null);
    try {
      const res = await apiFetch(`/api/scheduling/refuerzos/${sel.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aprobar,
          nota: nota.trim() === "" ? null : nota.trim(),
          refuerzo: aprobar ? { fecha, horaLocal: hora, duracionMin: duracion } : null,
        }),
      });
      const c: { error?: { message?: string } } = await res.json();
      if (!res.ok) {
        setErrorModal(c.error?.message ?? "No se pudo resolver la solicitud.");
        return;
      }
      setAviso(
        aprobar
          ? `Refuerzo creado para ${sel.salon} el ${fecha} a las ${hora}.`
          : "Solicitud no autorizada.",
      );
      setSel(null);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "76rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Refuerzos</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        Solicitudes de <strong>repetir una sesión</strong> marcadas por los guías, pendientes de
        autorización. Autorizar crea una clase <strong>extra</strong>: no extiende el curso.
      </p>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, marginTop: "0.8rem" }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p style={{ color: "#1b5e20", fontWeight: 600, marginTop: "0.8rem" }}>{aviso}</p>
      )}

      <section
        style={{
          marginTop: "1.2rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
          gap: "0.7rem",
          background: "white",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "0.9rem 1rem",
        }}
      >
        <div>
          <label style={rotulo} htmlFor="f-estado">
            Estado
          </label>
          <select
            id="f-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as (typeof ESTADOS)[number])}
            style={{ ...campo, width: "100%" }}
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e === "TODAS" ? "Todas" : e.charAt(0) + e.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={rotulo} htmlFor="f-guia">
            Guía
          </label>
          <select
            id="f-guia"
            value={guia}
            onChange={(e) => setGuia(e.target.value)}
            style={{ ...campo, width: "100%" }}
          >
            <option value="">Todos</option>
            {opciones.guias.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={rotulo} htmlFor="f-curso">
            Curso
          </label>
          <select
            id="f-curso"
            value={curso}
            onChange={(e) => setCurso(e.target.value)}
            style={{ ...campo, width: "100%" }}
          >
            <option value="">Todos</option>
            {opciones.cursos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={rotulo} htmlFor="f-salon">
            Salón
          </label>
          <select
            id="f-salon"
            value={salon}
            onChange={(e) => setSalon(e.target.value)}
            style={{ ...campo, width: "100%" }}
          >
            <option value="">Todos</option>
            {opciones.salones.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={rotulo} htmlFor="f-desde">
            Desde (solicitud)
          </label>
          <input
            id="f-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            style={{ ...campo, width: "100%" }}
          />
        </div>
        <div>
          <label style={rotulo} htmlFor="f-hasta">
            Hasta (solicitud)
          </label>
          <input
            id="f-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            style={{ ...campo, width: "100%" }}
          />
        </div>
      </section>

      <div style={{ marginTop: "0.8rem", fontSize: "0.82rem", color: "var(--texto-suave)" }}>
        {filas === null
          ? "Cargando…"
          : `${String(filas.length)} solicitud${filas.length === 1 ? "" : "es"}`}
        {(guia !== "" || curso !== "" || salon !== "" || desde !== "" || hasta !== "") && (
          <button
            type="button"
            onClick={() => {
              setGuia("");
              setCurso("");
              setSalon("");
              setDesde("");
              setHasta("");
            }}
            style={{
              marginLeft: "0.6rem",
              border: "none",
              background: "none",
              color: "var(--lgs-azul)",
              cursor: "pointer",
              font: "inherit",
              textDecoration: "underline",
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <section
        style={{
          marginTop: "0.6rem",
          background: "white",
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          overflowX: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#f7f9fd" }}>
              <th style={celda}>Guía</th>
              <th style={celda}>Campaña</th>
              <th style={celda}>Curso · País · Salón</th>
              <th style={celda}>Lección solicitada</th>
              <th style={celda}>Sesión</th>
              <th style={celda}>Fecha del evento</th>
              <th style={celda}>Solicitud</th>
              <th style={celda}>Estado</th>
              <th style={celda} />
            </tr>
          </thead>
          <tbody>
            {filas !== null && filas.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  style={{ ...celda, color: "var(--texto-suave)", padding: "1.5rem" }}
                >
                  No hay solicitudes con esos filtros.
                </td>
              </tr>
            )}
            {(filas ?? []).map((f) => (
              <tr key={f.id} style={{ borderTop: "1px solid #eef1f7" }}>
                <td style={celda}>{f.guia !== null && f.guia !== "" ? f.guia : "—"}</td>
                <td style={celda}>{f.campania}</td>
                <td style={celda}>
                  <strong>{f.cursoTipo}</strong> · {f.pais ?? "—"} · {f.salon}
                </td>
                <td style={celda}>
                  {f.leccionRef !== null ? (
                    <strong>{f.leccionRef}</strong>
                  ) : (
                    <span style={{ color: "var(--texto-suave)" }}>Sin especificar</span>
                  )}
                  {f.repetirLeccion && (
                    <span style={{ display: "block", fontSize: "0.72rem", color: "#e65100" }}>
                      repite la lección
                    </span>
                  )}
                </td>
                <td style={celda}>
                  {f.numero > 0 ? `N° ${String(f.numero)}` : "Evento suelto"}
                  {f.nivel !== null && (
                    <span style={{ color: "var(--texto-suave)" }}> · {f.nivel}</span>
                  )}
                </td>
                <td style={celda}>{f.fechaEvento}</td>
                <td style={celda}>{soloFecha(f.solicitadoEn)}</td>
                <td style={celda}>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      padding: "0.12rem 0.5rem",
                      borderRadius: "1rem",
                      background: COLOR_ESTADO[f.estado].bg,
                      color: COLOR_ESTADO[f.estado].c,
                    }}
                  >
                    {f.estado}
                  </span>
                  {f.fechaRefuerzo !== null && (
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.72rem",
                        color: "var(--texto-suave)",
                      }}
                    >
                      refuerzo: {f.fechaRefuerzo}
                    </span>
                  )}
                </td>
                <td style={{ ...celda, textAlign: "right" }}>
                  {f.estado === "PENDIENTE" && (
                    <button
                      type="button"
                      onClick={() => abrir(f)}
                      style={{
                        padding: "0.4rem 0.9rem",
                        borderRadius: "0.5rem",
                        border: "none",
                        background: "var(--lgs-azul)",
                        color: "white",
                        fontWeight: 700,
                        cursor: "pointer",
                        fontSize: "0.8rem",
                      }}
                    >
                      Revisar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sel !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Autorizar refuerzo"
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
          onClick={() => {
            if (!ocupado) setSel(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "34rem",
              background: "white",
              borderRadius: "1rem",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.8rem",
            }}
          >
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>Autorizar refuerzo</h2>
            <p style={{ fontSize: "0.9rem", margin: 0 }}>
              {sel.cursoTipo} · {sel.salon}, sesión del <strong>{sel.fechaEvento}</strong>, guía{" "}
              <strong>{sel.guia !== null && sel.guia !== "" ? sel.guia : "sin asignar"}</strong>.
            </p>
            <p
              style={{
                fontSize: "0.82rem",
                background: "#fff8e1",
                border: "1px solid #ffe0a3",
                borderRadius: "0.6rem",
                padding: "0.6rem 0.75rem",
                margin: 0,
              }}
            >
              Al autorizar se crea una <strong>clase extra</strong> en este salón. El curso{" "}
              <strong>no</strong> se extiende y su fecha de fin no cambia. La lista sale de las
              matrículas activas, y el avance del alumno no se altera: depende de las evaluaciones.
            </p>

            <div style={{ fontSize: "0.85rem" }}>
              <span style={rotulo}>Lección solicitada</span>
              <p style={{ margin: 0 }}>
                {sel.leccionRef ?? "Sin especificar"}
                {sel.repetirLeccion && " · se repite la lección"}
              </p>
            </div>
            <div style={{ fontSize: "0.85rem" }}>
              <span style={rotulo}>Motivo del guía</span>
              <p style={{ margin: 0 }}>{sel.motivo}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem" }}>
              <div>
                <label style={rotulo} htmlFor="r-fecha">
                  Fecha *
                </label>
                <input
                  id="r-fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  style={{ ...campo, width: "100%" }}
                />
              </div>
              <div>
                <label style={rotulo} htmlFor="r-hora">
                  Hora *
                </label>
                <input
                  id="r-hora"
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  style={{ ...campo, width: "100%" }}
                />
              </div>
              <div>
                <label style={rotulo} htmlFor="r-dur">
                  Minutos
                </label>
                <input
                  id="r-dur"
                  type="number"
                  min={15}
                  max={300}
                  value={duracion}
                  onChange={(e) => setDuracion(Number(e.target.value))}
                  style={{ ...campo, width: "100%" }}
                />
              </div>
            </div>
            <p style={{ fontSize: "0.74rem", color: "var(--texto-suave)", margin: 0 }}>
              Hora de pared del salón. No puede coincidir con otra sesión del mismo salón.
            </p>

            <div>
              <label style={rotulo} htmlFor="r-nota">
                Comentario (quién autoriza / motivo)
              </label>
              <textarea
                id="r-nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                style={{ ...campo, width: "100%", resize: "vertical" }}
              />
            </div>

            {errorModal !== null && (
              <p role="alert" style={{ color: "#c62828", fontWeight: 600, fontSize: "0.85rem" }}>
                {errorModal}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setSel(null)}
                disabled={ocupado}
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
                onClick={() => void resolver(false)}
                disabled={ocupado}
                style={{
                  padding: "0.6rem 1.1rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "#fdecea",
                  color: "#b71c1c",
                  fontWeight: 700,
                  cursor: ocupado ? "wait" : "pointer",
                }}
              >
                No autorizar
              </button>
              <button
                type="button"
                onClick={() => void resolver(true)}
                disabled={ocupado || fecha === "" || hora === ""}
                style={{
                  padding: "0.6rem 1.1rem",
                  borderRadius: "0.6rem",
                  border: "none",
                  background: "var(--lgs-verde)",
                  color: "white",
                  fontWeight: 700,
                  cursor: ocupado ? "wait" : "pointer",
                  opacity: fecha === "" || hora === "" ? 0.5 : 1,
                }}
              >
                {ocupado ? "Guardando…" : "Autorizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
