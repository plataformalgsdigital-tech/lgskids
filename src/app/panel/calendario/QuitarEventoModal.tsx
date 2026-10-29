"use client";

import { useState } from "react";
import { apiFetch } from "@/ui/api-fetch";
import type { AgendaSesion } from "./agenda-comun";

/**
 * La ✕ de una tarjeta de la Agenda (2026-10-29, como la de LGS). Hace lo que
 * corresponde a cada cosa:
 *  - un EVENTO creado a mano (sesión extra, club, taller) se CANCELA: sale del
 *    calendario en todos sus salones; en un Club de tanda, solo esta sesión o
 *    toda la tanda desde aquí (`DELETE /api/scheduling/eventos/[id]`);
 *  - una clase del HORARIO se SUSPENDE ese día: corre al final del curso con su
 *    motivo (`POST /api/scheduling/classrooms/[id]/suspend`).
 */
export function QuitarEventoModal({
  sesion,
  onCerrar,
  onHecho,
}: {
  sesion: AgendaSesion;
  onCerrar: () => void;
  /** Hecho: la agenda se recarga y se muestra el aviso. */
  onHecho: (aviso: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [todaLaTanda, setTodaLaTanda] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esClub = sesion.tipo === "CLUB";
  const nombre = esClub ? "club" : sesion.tipo === "TALLER" ? "taller" : "evento";

  async function confirmar() {
    setOcupado(true);
    setError(null);
    try {
      const res = sesion.esEvento
        ? await apiFetch(
            `/api/scheduling/eventos/${sesion.id}${todaLaTanda ? "?todaLaTanda=1" : ""}`,
            { method: "DELETE" },
          )
        : await apiFetch(`/api/scheduling/classrooms/${sesion.classroomId}/suspend`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fecha: sesion.fecha, motivo: motivo.trim() }),
          });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo completar.");
        return;
      }
      if (sesion.esEvento) {
        const { sesiones } = (await res.json()) as { sesiones: number };
        onHecho(
          `Se canceló el ${nombre} (${String(sesiones)} sesión${sesiones === 1 ? "" : "es"} del calendario).`,
        );
      } else {
        onHecho("Día suspendido. La sesión se corrió al final del curso.");
      }
    } finally {
      setOcupado(false);
    }
  }

  const campo = {
    width: "100%",
    padding: "0.55rem",
    borderRadius: "0.5rem",
    border: "1.5px solid #d8dce6",
    fontSize: "0.88rem",
  } as const;

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={sesion.esEvento ? `Cancelar ${nombre}` : "Suspender este día"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(8,11,24,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "30rem",
          background: "white",
          borderRadius: "0.9rem",
          padding: "1.25rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
          {sesion.esEvento ? `✕ Cancelar ${nombre}` : "⏸ Suspender este día"}
        </h2>
        <p style={{ margin: 0, fontSize: "0.88rem" }}>
          <strong>{sesion.salon}</strong> · {sesion.campania} · {sesion.fecha} {sesion.horaLocal}
        </p>

        {sesion.esEvento ? (
          <>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
              Sale del calendario en todos los salones donde se dicta. Los niños inscritos o
              agendados quedan cancelados (queda el registro). No se puede si ya se registró o tiene
              asistencia.
            </p>
            {sesion.tandaId !== null && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <label style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                  <input
                    type="radio"
                    checked={!todaLaTanda}
                    onChange={() => setTodaLaTanda(false)}
                  />
                  Solo esta sesión
                </label>
                <label style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                  <input type="radio" checked={todaLaTanda} onChange={() => setTodaLaTanda(true)} />
                  Toda la tanda: esta y todas las que siguen (cancela también las inscripciones)
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" }}>
              Es una clase del horario del salón: no se borra, se SUSPENDE ese día y la sesión se
              corre AL FINAL del curso (el total no cambia).
            </p>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (obligatorio)"
              style={campo}
            />
          </>
        )}

        {error !== null && (
          <p role="alert" style={{ margin: 0, color: "#c62828", fontWeight: 700 }}>
            ⚠️ {error}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCerrar}
            disabled={ocupado}
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: "0.5rem",
              border: "1px solid #d8dce6",
              background: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Volver
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={ocupado || (!sesion.esEvento && motivo.trim() === "")}
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#c62828",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {ocupado ? "…" : sesion.esEvento ? `Cancelar ${nombre}` : "Suspender"}
          </button>
        </div>
      </div>
    </div>
  );
}
