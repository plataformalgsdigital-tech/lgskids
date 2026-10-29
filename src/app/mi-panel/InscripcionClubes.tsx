"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * "Inscripción Clubes" del panel del niño (2026-10-29): los clubes de la SEMANA
 * EN CURSO que le corresponden —por la campaña, país, curso, salón y nivel con
 * que se crearon (o "Todos")—. Inscribirse lo deja en la lista de TODAS las
 * sesiones que le quedan al club; con 2 faltas seguidas sale y libera el cupo.
 * La regla la decide el servidor (`GET /api/student/clubes`); aquí solo se pinta.
 */
interface Club {
  id: string;
  startsAt: string;
  duracionMin: number;
  salon: string;
  campania: string | null;
  guia: string | null;
  limite: number;
  ocupados: number;
  lleno: boolean;
  enSuLista: boolean;
  propia: boolean;
  agendadoId: string | null;
  choque: string | null;
  nivel: string | null;
  observaciones: string | null;
  tanda: { fin: string; restantes: number } | null;
  retiradoPorFaltas: boolean;
}

const NIVEL: Record<string, string> = {
  ROOKIE: "Rookie",
  CHAMPION: "Champion",
  ELITE: "Elite",
  LEGENDARY: "Legendary",
  ULTIMATE: "Ultimate Stage",
};

const dia = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" });
const hora = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
// El fin de la tanda es una FECHA (sin hora): se lee a mediodía UTC para no correrla.
const finTanda = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  const cuerpo: { error?: { message?: string } } = await res.json().catch(() => ({}));
  return cuerpo.error?.message ?? porDefecto;
}

export function InscripcionClubesModal({
  onCerrar,
  onCambio,
}: {
  onCerrar: () => void;
  /** Se inscribió o se borró: el panel recarga su agenda. */
  onCambio: () => void;
}) {
  const [clubes, setClubes] = useState<Club[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Subirla vuelve a pedir la lista (tras inscribirse o salirse).
  const [version, setVersion] = useState(0);
  const cargar = () => setVersion((v) => v + 1);

  useEffect(() => {
    let cancelado = false;
    async function traer() {
      const res = await apiFetch("/api/student/clubes");
      if (cancelado) return;
      if (!res.ok) {
        setError(await mensajeDeError(res, "No pudimos cargar los clubes."));
        setClubes([]);
        return;
      }
      const cuerpo = (await res.json()) as { clubes: Club[] };
      if (!cancelado) setClubes(cuerpo.clubes);
    }
    void traer();
    return () => {
      cancelado = true;
    };
  }, [version]);

  async function inscribir(c: Club) {
    setOcupado(c.id);
    setError(null);
    setAviso(null);
    const res = await apiFetch("/api/student/clubes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: c.id }),
    });
    setOcupado(null);
    if (!res.ok) {
      setError(await mensajeDeError(res, "No pudimos inscribirte."));
    } else {
      setAviso(
        c.tanda !== null
          ? `¡Listo! Quedaste inscrito desde el ${dia.format(new Date(c.startsAt))}, cada semana. Recuerda: si faltas dos veces seguidas, saldrás del club.`
          : `¡Listo! Quedaste inscrito el ${dia.format(new Date(c.startsAt))}.`,
      );
      onCambio();
    }
    cargar();
  }

  async function cancelar(c: Club) {
    if (c.agendadoId === null) return;
    if (
      !window.confirm(
        "¿Quieres salir de este club? Dejarás tu cupo en todas las sesiones que faltan.",
      )
    )
      return;
    setOcupado(c.id);
    setError(null);
    setAviso(null);
    const res = await apiFetch(
      `/api/student/clubes?agendadoId=${encodeURIComponent(c.agendadoId)}`,
      { method: "DELETE" },
    );
    setOcupado(null);
    if (!res.ok) {
      setError(await mensajeDeError(res, "No pudimos cancelar tu inscripción."));
    } else {
      setAviso("Saliste del club.");
      onCambio();
    }
    cargar();
  }

  // Agrupados por día (en el reloj de quien mira).
  const dias = new Map<string, Club[]>();
  for (const c of clubes ?? []) {
    const d = dia.format(new Date(c.startsAt));
    dias.set(d, [...(dias.get(d) ?? []), c]);
  }

  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Inscripción Clubes"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(8,11,24,0.55)",
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
          maxWidth: "40rem",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #eef1f7",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.15rem", margin: 0 }}>📅 Inscripción Clubes</h2>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.82rem", color: "var(--texto-suave)" }}>
              Los clubes de esta semana para ti. La hora está en tu reloj.
            </p>
            <p
              role="note"
              style={{
                margin: "0.5rem 0 0",
                padding: "0.5rem 0.7rem",
                borderRadius: "0.5rem",
                background: "#fff8e1",
                border: "1px solid #ffd54f",
                fontSize: "0.82rem",
                color: "#5d4300",
              }}
            >
              ⚠️ Al inscribirte quedas en la lista de <b>todas las sesiones</b> que le quedan al
              club. Si <b>faltas dos veces seguidas</b>, saldrás del club, tu cupo quedará libre y
              tendrás que inscribirte de nuevo.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            style={{
              border: "1px solid #e3e7f0",
              borderRadius: "0.5rem",
              width: "2rem",
              height: "2rem",
              background: "white",
              cursor: "pointer",
              fontSize: "1.1rem",
              lineHeight: 1,
              color: "var(--texto-suave)",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {aviso !== null && (
            <p style={{ margin: 0, color: "#1b5e20", fontWeight: 700 }}>✅ {aviso}</p>
          )}
          {error !== null && (
            <p style={{ margin: 0, color: "#b71c1c", fontWeight: 700 }}>⚠️ {error}</p>
          )}
          {clubes === null ? (
            <p style={{ margin: 0, color: "var(--texto-suave)" }}>Cargando clubes…</p>
          ) : clubes.length === 0 ? (
            <p style={{ margin: 0, color: "var(--texto-suave)" }}>
              Esta semana no hay clubes disponibles para ti. ¡Vuelve a mirar la próxima semana!
            </p>
          ) : (
            [...dias.entries()].map(([d, lista]) => (
              <section key={d}>
                <h3
                  style={{
                    fontSize: "0.95rem",
                    margin: "0 0 0.5rem",
                    textTransform: "capitalize",
                  }}
                >
                  {d}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {lista.map((c) => {
                    const inicio = new Date(c.startsAt);
                    const fin = new Date(inicio.getTime() + c.duracionMin * 60_000);
                    const libres = Math.max(0, c.limite - c.ocupados);
                    return (
                      <div
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          padding: "0.7rem 0.9rem",
                          borderRadius: "0.7rem",
                          border: "1px solid #e3e7f0",
                          borderLeft: `4px solid ${c.enSuLista ? "#43a047" : "#7c4dff"}`,
                          background: c.enSuLista ? "#f1f8e9" : "white",
                        }}
                      >
                        <div style={{ flex: "1 1 14rem", minWidth: 0 }}>
                          <div style={{ fontWeight: 800 }}>
                            🎲 Club · {hora.format(inicio)} – {hora.format(fin)}
                          </div>
                          {c.observaciones !== null && (
                            <div style={{ fontSize: "0.88rem" }}>{c.observaciones}</div>
                          )}
                          <div style={{ fontSize: "0.8rem", color: "var(--texto-suave)" }}>
                            {[
                              c.guia !== null ? `Guía: ${c.guia}` : null,
                              c.nivel !== null
                                ? `Nivel ${NIVEL[c.nivel] ?? c.nivel}`
                                : "Todos los niveles",
                              c.tanda !== null
                                ? `Cada semana hasta el ${finTanda.format(new Date(`${c.tanda.fin}T12:00:00Z`))}`
                                : "Una sola sesión",
                              `${String(libres)} ${libres === 1 ? "cupo" : "cupos"}`,
                            ]
                              .filter((x) => x !== null)
                              .join(" · ")}
                          </div>
                          {c.retiradoPorFaltas && (
                            <div style={{ fontSize: "0.8rem", color: "#b71c1c", fontWeight: 700 }}>
                              Saliste de este club por dos faltas seguidas. Puedes inscribirte de
                              nuevo.
                            </div>
                          )}
                          {c.choque !== null && !c.enSuLista && (
                            <div style={{ fontSize: "0.8rem", color: "#b26a00", fontWeight: 700 }}>
                              A esa hora ya tienes {c.choque}.
                            </div>
                          )}
                        </div>
                        {c.agendadoId !== null ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span
                              style={{ color: "#1b5e20", fontWeight: 800, fontSize: "0.85rem" }}
                            >
                              ✓ Inscrito
                            </span>
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => void cancelar(c)}
                              style={{
                                padding: "0.4rem 0.75rem",
                                borderRadius: "0.5rem",
                                border: "1px solid #e57373",
                                background: "white",
                                color: "#b71c1c",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={ocupado !== null || c.lleno || c.choque !== null}
                            onClick={() => void inscribir(c)}
                            title={
                              c.lleno
                                ? "Este club ya no tiene cupos"
                                : c.choque !== null
                                  ? "Choca con algo que ya tienes"
                                  : undefined
                            }
                            style={{
                              padding: "0.45rem 0.9rem",
                              borderRadius: "0.5rem",
                              border: "none",
                              background:
                                c.lleno || c.choque !== null ? "#cfd8dc" : "var(--lgs-verde)",
                              color: "#1b2a10",
                              fontWeight: 800,
                              cursor:
                                c.lleno || c.choque !== null || ocupado !== null
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            {ocupado === c.id ? "…" : c.lleno ? "Lleno" : "Inscribirme"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
