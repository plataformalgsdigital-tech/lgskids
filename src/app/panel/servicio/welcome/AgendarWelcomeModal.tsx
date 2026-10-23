"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Agendar (o reagendar) el Welcome de un niño desde Servicio, como el
 * AgendarWelcomeModal de MOSAICO. Usa la MISMA ruta que la ficha del niño: los
 * Welcome que le sirven (su nivel, campaña, país, curso y salón) y la reserva
 * con bloqueo, que además aplica el tope de 2 intentos. Los llenos se ven pero
 * no se eligen. La reserva perdida NO se borra: queda en su Welcome.
 */

interface Opcion {
  id: string;
  startsAt: string;
  duracionMin: number;
  guia: string;
  nivel: string;
  limiteUsuarios: number;
  inscritos: number;
  libres: number;
  enMarcha: boolean;
}

const boton: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es", { dateStyle: "full", timeStyle: "short" });

export function AgendarWelcomeModal({
  nino,
  aviso,
  ruta,
  titulo = "👋 Agendar Welcome",
  nota = "La sesión a la que faltó no se borra: queda en su Welcome. Cada niño tiene hasta 2 Welcome; después corresponde el video de bienvenida.",
  sinOpciones = "No hay Welcome futuros que le sirvan a este niño (su nivel, campaña, país y salón). Programa uno en el calendario.",
  textoBoton = "Agendar",
  onCerrar,
  onAgendado,
}: {
  nino: { childPersonId: string; nombre: string };
  /** Contexto para quien agenda (p. ej. "Faltó al Welcome del …"). */
  aviso?: string;
  /**
   * Ruta de GET (opciones) y POST (agendar). Por defecto la de la ficha; el
   * panel del alumno usa la suya (`/api/student/welcome`), que toma al niño de
   * la sesión.
   */
  ruta?: string;
  titulo?: string;
  nota?: string;
  sinOpciones?: string;
  textoBoton?: string;
  onCerrar: () => void;
  onAgendado: (texto: string) => void;
}) {
  const url = ruta ?? `/api/contracts/ninos/${nino.childPersonId}/welcome`;
  const [opciones, setOpciones] = useState<Opcion[] | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [elegido, setElegido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(url);
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudieron cargar los Welcome.");
        setOpciones([]);
        return;
      }
      const d = (await res.json()) as { welcomes: Opcion[]; motivo: string | null };
      setOpciones(d.welcomes);
      setMotivo(d.motivo);
    }
    void cargar();
  }, [url]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  async function agendar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeId: elegido }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo agendar.");
        return;
      }
      const w = opciones?.find((o) => o.id === elegido);
      onAgendado(
        `${nino.nombre} quedó agendado al Welcome del ${w !== undefined ? cuando(w.startsAt) : ""}.`,
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Agendar Welcome"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(8,11,24,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "34rem",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          padding: "1.1rem 1.25rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>{titulo}</h2>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          <strong>{nino.nombre}</strong>
        </p>
        {aviso !== undefined && (
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--texto-suave)" }}>{aviso}</p>
        )}

        {opciones === null ? (
          <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
        ) : opciones.length === 0 ? (
          <p
            style={{
              margin: 0,
              padding: "0.6rem 0.8rem",
              borderRadius: "0.6rem",
              background: "#fff8e1",
              border: "1px solid #ffe082",
              fontSize: "0.86rem",
            }}
          >
            {motivo ?? sinOpciones}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {opciones.map((o) => {
              const lleno = o.libres === 0;
              return (
                <label
                  key={o.id}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    padding: "0.5rem 0.7rem",
                    border: `1px solid ${elegido === o.id ? "var(--lgs-azul)" : "#e3e7f0"}`,
                    borderRadius: "0.6rem",
                    opacity: lleno ? 0.5 : 1,
                    cursor: lleno ? "not-allowed" : "pointer",
                    fontSize: "0.86rem",
                  }}
                >
                  <input
                    type="radio"
                    name="welcome"
                    disabled={lleno}
                    checked={elegido === o.id}
                    onChange={() => setElegido(o.id)}
                  />
                  <span style={{ flex: 1 }}>
                    {cuando(o.startsAt)} · {o.guia}
                    {o.enMarcha && " · curso en marcha"}
                  </span>
                  <span
                    style={{
                      padding: "0.1rem 0.5rem",
                      borderRadius: "999px",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      background: lleno ? "#ffebee" : "#e8f5e9",
                      color: lleno ? "#c62828" : "#1b5e20",
                    }}
                  >
                    {lleno ? "Lleno" : `${String(o.inscritos)}/${String(o.limiteUsuarios)}`}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--texto-suave)" }}>{nota}</p>

        {error !== null && (
          <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" style={boton} onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={ocupado || elegido === ""}
            onClick={() => void agendar()}
            style={{
              ...boton,
              border: "none",
              background: elegido === "" ? "#c9c6d8" : "var(--lgs-azul)",
              color: "white",
            }}
          >
            {ocupado ? "Agendando…" : textoBoton}
          </button>
        </div>
      </div>
    </div>
  );
}
