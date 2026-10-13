"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Pestaña "Colisiones": guías con dos salones cuyas sesiones futuras se pisan.
 * Dice si los dos salones son del MISMO curso (Junior con Junior, Youngster con
 * Youngster): es el único caso en que el negocio podría dejar que el guía los
 * dicte juntos. Entre cursos distintos, uno de los salones necesita otro guía.
 */

interface Colision {
  guiaUserId: string;
  guia: string;
  salonA: string;
  campaniaA: string;
  cursoA: string;
  salonB: string;
  campaniaB: string;
  cursoB: string;
  mismoCurso: boolean;
  choques: number;
  proximo: string;
  timezone: string;
}

const celda = { padding: "0.5rem 0.6rem", borderBottom: "1px solid #eef1f7" } as const;

/** "martes 20 oct · 18:00" en la zona del salón (la hora de pared de la clase). */
function horario(iso: string, zona: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short", timeZone: zona })} · ${d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", timeZone: zona })}`;
}

export function ColisionesCampania({ campaignId }: { campaignId: string }) {
  const [colisiones, setColisiones] = useState<Colision[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/scheduling/campaigns/${campaignId}/colisiones`);
    if (!res.ok) {
      setError("No se pudieron cargar las colisiones.");
      return;
    }
    setColisiones(((await res.json()) as { colisiones: Colision[] }).colisiones);
  }, [campaignId]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  if (error !== null) {
    return (
      <p role="alert" style={{ color: "#c62828" }}>
        {error}
      </p>
    );
  }
  if (colisiones === null) return <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>;

  return (
    <section
      style={{
        marginTop: "1rem",
        border: "1px solid #e3e7f0",
        borderRadius: "0.9rem",
        padding: "1.1rem 1.25rem",
      }}
    >
      <h2 style={{ fontSize: "1.15rem", margin: 0 }}>Colisiones de guías ({colisiones.length})</h2>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.85rem", margin: "0.3rem 0 0.8rem" }}>
        Un mismo guía con dos salones cuyas sesiones futuras se pisan. Incluye los choques con
        salones de otras campañas. La hora es la del salón.
      </p>
      {colisiones.length === 0 ? (
        <p style={{ color: "#2e7d32", fontWeight: 600 }}>
          ✓ Ningún guía tiene clases que se pisen.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-suave)" }}>
                <th style={celda}>Guía</th>
                <th style={celda}>Salón</th>
                <th style={celda}>Choca con</th>
                <th style={celda}>Cursos</th>
                <th style={celda}>Próximo choque</th>
                <th style={celda}>Sesiones</th>
              </tr>
            </thead>
            <tbody>
              {colisiones.map((c) => (
                <tr key={`${c.guiaUserId}-${c.salonA}-${c.campaniaA}-${c.salonB}-${c.campaniaB}`}>
                  <td style={{ ...celda, fontWeight: 700 }}>{c.guia}</td>
                  <td style={celda}>
                    {c.salonA}
                    <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
                      {c.campaniaA}
                    </div>
                  </td>
                  <td style={celda}>
                    {c.salonB}
                    <div style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
                      {c.campaniaB}
                    </div>
                  </td>
                  <td style={celda}>
                    {c.mismoCurso ? (
                      <span style={{ color: "#1b5e20", fontWeight: 700 }}>
                        Mismo curso ({c.cursoA})
                      </span>
                    ) : (
                      <span style={{ color: "#c62828", fontWeight: 700 }}>
                        Distintos ({c.cursoA} / {c.cursoB})
                      </span>
                    )}
                  </td>
                  <td style={{ ...celda, textTransform: "capitalize" }}>
                    {horario(c.proximo, c.timezone)}
                  </td>
                  <td style={celda}>{c.choques}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
