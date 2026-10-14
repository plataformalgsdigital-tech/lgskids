"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Cancelación de la sesión por el guía, dentro del modal de la sesión.
 *  - El guía AVISA que no puede dictarla, con motivo.
 *  - Administración la resuelve: APRUEBA (cuenta en las horas del guía), y
 *    puede cubrirla con otro guía SOLO esa vez; o la RECHAZA.
 *  - Administración también puede cancelarla directamente.
 */

interface Cancelacion {
  id: string;
  guia: string;
  motivo: string;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  solicitante: string;
  createdAt: string;
  notaResolucion: string | null;
  reemplazo: string | null;
}

interface GuiaOpcion {
  id: string;
  nombre: string | null;
  username: string;
}

const boton: CSSProperties = {
  padding: "0.45rem 0.85rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.83rem",
};
const campo: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  borderRadius: "0.5rem",
  border: "1.5px solid #d8dce6",
  fontFamily: "inherit",
  fontSize: "0.88rem",
};

export function CancelacionSesion({
  sessionId,
  guiaActualId,
  cerrada,
  onCambio,
}: {
  sessionId: string;
  /** El guía efectivo: no se ofrece como su propio reemplazo. */
  guiaActualId: string | null;
  cerrada: boolean;
  /** La sesión cambió (guía o estado): el modal la vuelve a cargar. */
  onCambio: () => void;
}) {
  const [cancelacion, setCancelacion] = useState<Cancelacion | null>(null);
  const [puedeAvisar, setPuedeAvisar] = useState(false);
  const [puedeResolver, setPuedeResolver] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [directa, setDirecta] = useState(false);
  const [reemplazo, setReemplazo] = useState("");
  const [nota, setNota] = useState("");
  const [guias, setGuias] = useState<GuiaOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/scheduling/sessions/${sessionId}/cancelacion`);
    if (!res.ok) return;
    const d = (await res.json()) as {
      cancelacion: Cancelacion | null;
      puedeAvisar: boolean;
      puedeResolver: boolean;
    };
    setCancelacion(d.cancelacion);
    setPuedeAvisar(d.puedeAvisar);
    setPuedeResolver(d.puedeResolver);
    setCargado(true);
  }, [sessionId]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  // La lista de guías solo hace falta a administración (para el reemplazo).
  useEffect(() => {
    if (!puedeResolver || guias.length > 0) return;
    async function cargarGuias() {
      const res = await apiFetch("/api/identity/guides");
      if (res.ok) setGuias(((await res.json()) as { guias: GuiaOpcion[] }).guias);
    }
    void cargarGuias();
  }, [puedeResolver, guias.length]);

  async function enviar(url: string, cuerpo: unknown, exito: () => void) {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo guardar.");
        return;
      }
      exito();
      await cargar();
      onCambio();
    } finally {
      setOcupado(false);
    }
  }

  const selectorReemplazo = (
    <label
      style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.82rem" }}
    >
      <strong>¿Quién la cubre?</strong>
      <select value={reemplazo} onChange={(e) => setReemplazo(e.target.value)} style={campo}>
        <option value="">Nadie: la sesión no se dicta (queda cancelada)</option>
        {guias
          .filter((g) => g.id !== guiaActualId)
          .map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre ?? g.username}
            </option>
          ))}
      </select>
      <span style={{ color: "var(--texto-suave)" }}>
        El reemplazo es solo de ESTA sesión: las demás siguen con el guía del salón.
      </span>
    </label>
  );

  if (!cargado) return null;
  const viva = cancelacion !== null && cancelacion.estado !== "RECHAZADA";

  return (
    <section
      style={{
        background: "white",
        border: "1px solid #e3e7f0",
        borderRadius: "0.9rem",
        padding: "0.9rem 1.1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
      }}
    >
      <h3 style={{ fontSize: "0.96rem", fontWeight: 800, margin: 0 }}>Cancelación del guía</h3>

      {cancelacion?.estado === "PENDIENTE" && (
        <div style={{ fontSize: "0.86rem", lineHeight: 1.45 }}>
          <strong style={{ color: "#6a1b9a" }}>
            ⚠ {cancelacion.guia} avisó que no puede dictarla.
          </strong>{" "}
          Motivo: {cancelacion.motivo}
          <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
            Avisó {cancelacion.solicitante} ·{" "}
            {new Date(cancelacion.createdAt).toLocaleString("es", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . Pendiente de que administración la resuelva.
          </div>
        </div>
      )}
      {cancelacion?.estado === "APROBADA" && (
        <div style={{ fontSize: "0.86rem", lineHeight: 1.45 }}>
          {cancelacion.reemplazo !== null ? (
            <strong style={{ color: "#1b5e20" }}>
              ✔ {cancelacion.guia} canceló; la cubre {cancelacion.reemplazo} (solo esta sesión).
            </strong>
          ) : (
            <strong style={{ color: "#6a1b9a" }}>
              ✖ Sesión CANCELADA: {cancelacion.guia} no la dicta y nadie la cubre.
            </strong>
          )}{" "}
          Motivo: {cancelacion.motivo}
          {cancelacion.notaResolucion !== null && (
            <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
              Nota de administración: {cancelacion.notaResolucion}
            </div>
          )}
        </div>
      )}
      {cancelacion?.estado === "RECHAZADA" && (
        <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
          El último aviso de {cancelacion.guia} fue rechazado
          {cancelacion.notaResolucion !== null ? `: ${cancelacion.notaResolucion}` : ""}.
        </div>
      )}

      {/* Administración resuelve el aviso pendiente. */}
      {cancelacion?.estado === "PENDIENTE" && puedeResolver && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {selectorReemplazo}
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={500}
            placeholder="Nota (opcional)"
            style={campo}
          />
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={ocupado}
              style={{ ...boton, border: "none", background: "#6a1b9a", color: "white" }}
              onClick={() =>
                void enviar(
                  `/api/scheduling/cancelaciones/${cancelacion.id}`,
                  {
                    aprobar: true,
                    reemplazoGuiaUserId: reemplazo === "" ? null : reemplazo,
                    nota: nota === "" ? null : nota,
                  },
                  () => setNota(""),
                )
              }
            >
              {reemplazo === "" ? "Aprobar: cancelar la sesión" : "Aprobar y cubrir con el elegido"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              style={boton}
              onClick={() =>
                void enviar(
                  `/api/scheduling/cancelaciones/${cancelacion.id}`,
                  { aprobar: false, nota: nota === "" ? null : nota },
                  () => setNota(""),
                )
              }
            >
              Rechazar (el guía la dicta)
            </button>
          </div>
        </div>
      )}

      {/* Sin aviso vivo y sin registrar: se puede avisar (o cancelar, administración). */}
      {!viva && !cerrada && puedeAvisar && !abierto && (
        <div>
          <button type="button" style={boton} onClick={() => setAbierto(true)}>
            📣 Avisar cancelación
          </button>
        </div>
      )}
      {!viva && !cerrada && puedeAvisar && abierto && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="¿Por qué no se puede dictar? (mínimo 5 caracteres)"
            style={campo}
          />
          {puedeResolver && (
            <label
              style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.84rem" }}
            >
              <input
                type="checkbox"
                checked={directa}
                onChange={(e) => setDirecta(e.target.checked)}
              />
              Cancelarla ya (administración), sin esperar el aviso del guía
            </label>
          )}
          {puedeResolver && directa && selectorReemplazo}
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              type="button"
              disabled={ocupado || motivo.trim().length < 5}
              style={{ ...boton, border: "none", background: "#6a1b9a", color: "white" }}
              onClick={() =>
                void enviar(
                  `/api/scheduling/sessions/${sessionId}/cancelacion`,
                  {
                    motivo,
                    directa: puedeResolver && directa,
                    reemplazoGuiaUserId: directa && reemplazo !== "" ? reemplazo : null,
                  },
                  () => {
                    setMotivo("");
                    setAbierto(false);
                    setDirecta(false);
                  },
                )
              }
            >
              {puedeResolver && directa ? "Cancelar la sesión" : "Enviar aviso"}
            </button>
            <button
              type="button"
              style={boton}
              disabled={ocupado}
              onClick={() => setAbierto(false)}
            >
              Volver
            </button>
          </div>
          {!(puedeResolver && directa) && (
            <span style={{ fontSize: "0.76rem", color: "var(--texto-suave)" }}>
              El aviso le llega a administración, que decide si la cancela o la cubre con otro guía.
            </span>
          )}
        </div>
      )}

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
          {error}
        </p>
      )}
    </section>
  );
}
