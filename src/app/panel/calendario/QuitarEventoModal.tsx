"use client";

import { useState } from "react";
import { apiFetch } from "@/ui/api-fetch";
import type { AgendaSesion } from "./agenda-comun";

/**
 * Lo que hacen los íconos de una tarjeta de la Agenda (2026-10-29, como la de LGS):
 *  - ✕ "cancelar": un EVENTO creado a mano sale del calendario en todos sus
 *    salones (en un Club de tanda, solo esta sesión o toda la tanda;
 *    `DELETE /api/scheduling/eventos/[id]`); una clase del HORARIO se suspende
 *    ese día y corre al final del curso (`POST …/classrooms/[id]/suspend`);
 *  - ⏸ "suspender": el EVENTO queda en el calendario marcado como suspendido,
 *    con su motivo; no se pasa lista ni se registra
 *    (`POST /api/scheduling/eventos/[id]/suspension`);
 *  - ▶ "reactivar": deshace esa suspensión (`DELETE …/suspension`).
 */
export type AccionAgenda = "cancelar" | "suspender" | "reactivar";

export function QuitarEventoModal({
  sesion,
  accion,
  onCerrar,
  onHecho,
}: {
  sesion: AgendaSesion;
  accion: AccionAgenda;
  onCerrar: () => void;
  /** Hecho: la agenda se recarga y se muestra el aviso. */
  onHecho: (aviso: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [todaLaTanda, setTodaLaTanda] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombre = sesion.tipo === "CLUB" ? "club" : sesion.tipo === "TALLER" ? "taller" : "evento";
  // La ✕ sobre una clase del horario es la suspensión de siempre (corre al final).
  const suspenderDia = accion === "cancelar" && !sesion.esEvento;
  const pideMotivo = accion === "suspender" || suspenderDia;

  const titulo =
    accion === "reactivar"
      ? `▶ Reactivar ${nombre}`
      : accion === "suspender"
        ? `⏸ Suspender ${nombre}`
        : suspenderDia
          ? "⏸ Suspender este día"
          : `✕ Cancelar ${nombre}`;

  async function confirmar() {
    setOcupado(true);
    setError(null);
    try {
      const base = `/api/scheduling/eventos/${sesion.id}`;
      const res =
        accion === "reactivar"
          ? await apiFetch(`${base}/suspension`, { method: "DELETE" })
          : accion === "suspender"
            ? await apiFetch(`${base}/suspension`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ motivo: motivo.trim() }),
              })
            : suspenderDia
              ? await apiFetch(`/api/scheduling/classrooms/${sesion.classroomId}/suspend`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fecha: sesion.fecha, motivo: motivo.trim() }),
                })
              : await apiFetch(`${base}${todaLaTanda ? "?todaLaTanda=1" : ""}`, {
                  method: "DELETE",
                });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo completar.");
        return;
      }
      if (accion === "reactivar") {
        onHecho(`El ${nombre} se reactivó: vuelve a dictarse.`);
      } else if (accion === "suspender") {
        onHecho(`El ${nombre} quedó suspendido (sigue en el calendario, con su motivo).`);
      } else if (suspenderDia) {
        onHecho("Día suspendido. La sesión se corrió al final del curso.");
      } else {
        const { sesiones } = (await res.json()) as { sesiones: number };
        onHecho(
          `Se canceló el ${nombre} (${String(sesiones)} sesión${sesiones === 1 ? "" : "es"} del calendario).`,
        );
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
  const texto = { margin: 0, fontSize: "0.85rem", color: "var(--texto-suave)" } as const;

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
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
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{titulo}</h2>
        <p style={{ margin: 0, fontSize: "0.88rem" }}>
          <strong>{sesion.salon}</strong> · {sesion.campania} · {sesion.fecha} {sesion.horaLocal}
        </p>

        {accion === "reactivar" && (
          <p style={texto}>
            Suspendido por: <em>{sesion.motivoSuspension ?? "—"}</em>. Al reactivarlo vuelve a
            dictarse: se pasa lista y se registra como cualquier otro.
          </p>
        )}
        {accion === "suspender" && (
          <p style={texto}>
            NO se borra: queda en el calendario marcado como suspendido, con este motivo. No se pasa
            lista ni se registra, y los inscritos siguen inscritos (en un Club, esta semana no les
            cuenta como falta). Se puede reactivar.
          </p>
        )}
        {suspenderDia && (
          <p style={texto}>
            Es una clase del horario del salón: no se borra, se SUSPENDE ese día y la sesión se
            corre AL FINAL del curso (el total no cambia).
          </p>
        )}
        {accion === "cancelar" && sesion.esEvento && (
          <>
            <p style={texto}>
              Sale del calendario en todos los salones donde se dicta. Los niños inscritos o
              agendados quedan cancelados (queda el registro). No se puede si ya se registró o tiene
              asistencia. Si solo no se va a dictar, mejor ⏸ suspenderlo.
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
        )}
        {pideMotivo && (
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (obligatorio)"
            style={campo}
          />
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
            disabled={ocupado || (pideMotivo && motivo.trim() === "")}
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: "0.5rem",
              border: "none",
              background:
                accion === "reactivar" ? "#2e7d32" : accion === "suspender" ? "#ef6c00" : "#c62828",
              color: "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {ocupado
              ? "…"
              : accion === "reactivar"
                ? "Reactivar"
                : pideMotivo
                  ? "Suspender"
                  : `Cancelar ${nombre}`}
          </button>
        </div>
      </div>
    </div>
  );
}
