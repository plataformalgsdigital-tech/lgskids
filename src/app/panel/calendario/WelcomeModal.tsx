"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { horaLocal } from "@/ui/fecha-local";

/**
 * Detalle de un WELCOME: cuándo (en el reloj de quien mira), quién lo dicta,
 * para quién es, y la lista de los niños que lo agendaron, donde se pasa lista.
 */

interface Welcome {
  id: string;
  startsAt: string;
  duracionMin: number;
  guia: string;
  campania: string | null;
  pais: string | null;
  curso: string | null;
  salon: string | null;
  nivel: string;
  limiteUsuarios: number;
  inscritos: number;
  observaciones: string | null;
}

interface Inscrito {
  childPersonId: string;
  nombre: string;
  documento: string;
  salon: string | null;
  curso: string | null;
  asistio: boolean | null;
}

const boton: CSSProperties = {
  padding: "0.4rem 0.8rem",
  borderRadius: "0.55rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.82rem",
};

const PAIS: Record<string, string> = {
  CL: "Chile",
  CO: "Colombia/Ecuador/Perú",
  EC: "Ecuador",
  PE: "Perú",
};

export function WelcomeModal({
  welcomeId,
  onCerrar,
  onCambio,
}: {
  welcomeId: string;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  const [inscritos, setInscritos] = useState<Inscrito[]>([]);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [puedeMarcar, setPuedeMarcar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/scheduling/welcomes/${welcomeId}`);
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar el Welcome.");
      return;
    }
    const d = (await res.json()) as {
      welcome: Welcome;
      inscritos: Inscrito[];
      puedeEliminar: boolean;
      puedeMarcar: boolean;
    };
    setWelcome(d.welcome);
    setInscritos(d.inscritos);
    setPuedeEliminar(d.puedeEliminar);
    setPuedeMarcar(d.puedeMarcar);
  }, [welcomeId]);

  useEffect(() => {
    async function inicial() {
      await cargar();
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

  async function marcar(childPersonId: string, asistio: boolean | null) {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/welcomes/${welcomeId}/asistencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcas: [{ childPersonId, asistio }] }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo marcar.");
        return;
      }
      setInscritos((prev) =>
        prev.map((i) => (i.childPersonId === childPersonId ? { ...i, asistio } : i)),
      );
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar() {
    if (!window.confirm("¿Borrar este Welcome? No se puede deshacer.")) return;
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/scheduling/welcomes/${welcomeId}`, { method: "DELETE" });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo borrar.");
        return;
      }
      onCambio();
      onCerrar();
    } finally {
      setOcupado(false);
    }
  }

  const fila = (rotulo: string, valor: string) => (
    <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.88rem" }}>
      <span style={{ minWidth: "7.5rem", color: "var(--texto-suave)", fontWeight: 600 }}>
        {rotulo}
      </span>
      <span>{valor}</span>
    </div>
  );

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome"
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
          maxWidth: "40rem",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e3e7f0",
            background: "#e8f5e9",
          }}
        >
          <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>👋 Welcome</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            style={{ ...boton, borderRadius: "50%", width: "2.2rem", height: "2.2rem", padding: 0 }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: "1rem 1.25rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.7rem",
          }}
        >
          {error !== null && (
            <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
              {error}
            </p>
          )}
          {welcome === null ? (
            error === null && <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {fila(
                  "Cuándo",
                  `${new Date(welcome.startsAt).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${horaLocal(welcome.startsAt)} (tu hora) · ${String(welcome.duracionMin)} min`,
                )}
                {fila("Guía", welcome.guia)}
                {fila("Campaña", welcome.campania ?? "Todas")}
                {fila(
                  "País",
                  welcome.pais !== null ? (PAIS[welcome.pais] ?? welcome.pais) : "Todos",
                )}
                {fila("Curso", welcome.curso ?? "Todos")}
                {fila("Salón", welcome.salon ?? "Todos")}
                {fila("Nivel", welcome.nivel)}
                {fila(
                  "Inscritos",
                  `${String(welcome.inscritos)} / ${String(welcome.limiteUsuarios)}`,
                )}
                {welcome.observaciones !== null && fila("Observaciones", welcome.observaciones)}
              </div>

              <div style={{ borderTop: "1px solid #eef1f7", paddingTop: "0.7rem" }}>
                <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Niños agendados</h3>
                {inscritos.length === 0 ? (
                  <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", margin: 0 }}>
                    Todavía nadie lo agendó. Los niños lo eligen al crear su perfil.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {inscritos.map((i) => (
                      <div
                        key={i.childPersonId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                          padding: "0.45rem 0.6rem",
                          border: "1px solid #edf0f6",
                          borderRadius: "0.55rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        <span>
                          <a
                            href={`/panel/personas/${i.childPersonId}`}
                            style={{ fontWeight: 700 }}
                          >
                            {i.nombre}
                          </a>{" "}
                          <span style={{ color: "var(--texto-suave)" }}>
                            · {i.documento}
                            {i.salon !== null ? ` · ${i.curso ?? ""} ${i.salon}` : ""}
                          </span>
                        </span>
                        {puedeMarcar ? (
                          <span style={{ display: "flex", gap: "0.3rem" }}>
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                void marcar(i.childPersonId, i.asistio === true ? null : true)
                              }
                              style={{
                                ...boton,
                                background: i.asistio === true ? "#2e7d32" : "white",
                                color: i.asistio === true ? "white" : "inherit",
                              }}
                            >
                              Asistió
                            </button>
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                void marcar(i.childPersonId, i.asistio === false ? null : false)
                              }
                              style={{
                                ...boton,
                                background: i.asistio === false ? "#c62828" : "white",
                                color: i.asistio === false ? "white" : "inherit",
                              }}
                            >
                              No asistió
                            </button>
                          </span>
                        ) : (
                          <span style={{ color: "var(--texto-suave)" }}>
                            {i.asistio === null
                              ? "Sin marcar"
                              : i.asistio
                                ? "Asistió"
                                : "No asistió"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {puedeEliminar && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    disabled={ocupado || welcome.inscritos > 0}
                    title={
                      welcome.inscritos > 0
                        ? "Tiene niños agendados: no se puede borrar."
                        : undefined
                    }
                    onClick={() => void eliminar()}
                    style={{ ...boton, color: "#c62828", opacity: welcome.inscritos > 0 ? 0.5 : 1 }}
                  >
                    Borrar Welcome
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
