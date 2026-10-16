"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { ConOpcion } from "@/ui/ConOpcion";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Sesiones › Cancelaciones: los avisos de los guías que no pueden dictar una
 * sesión. Administración decide: aprobar la cancelación (cuenta en las horas
 * del guía), cubrirla con otro guía SOLO esa vez, o rechazarla. Pendientes
 * primero. `salones.gestionar`.
 */

interface Fila {
  id: string;
  sessionId: string | null;
  fecha: string;
  startsAt: string;
  guiaUserId: string;
  guia: string;
  motivo: string;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  solicitante: string;
  createdAt: string;
  notaResolucion: string | null;
  reemplazo: string | null;
  salon: string | null;
  campania: string | null;
  curso: string | null;
  timezone: string | null;
}

interface GuiaOpcion {
  id: string;
  nombre: string | null;
  username: string;
}

const celda: CSSProperties = {
  padding: "0.55rem 0.6rem",
  borderBottom: "1px solid #eef1f7",
  verticalAlign: "top",
};
const boton: CSSProperties = {
  padding: "0.35rem 0.7rem",
  borderRadius: "0.5rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: "0.78rem",
};
const ESTADO = {
  PENDIENTE: { texto: "Pendiente", color: "#b57a00" },
  APROBADA: { texto: "Aprobada", color: "#6a1b9a" },
  RECHAZADA: { texto: "Rechazada", color: "var(--texto-suave)" },
} as const;

function horaDelSalon(iso: string, zona: string | null): string {
  return new Date(iso).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zona ?? undefined,
  });
}

function CancelacionesPageContenido() {
  const [estado, setEstado] = useState("PENDIENTE");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [guias, setGuias] = useState<GuiaOpcion[]>([]);
  const [reemplazos, setReemplazos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/scheduling/cancelaciones?estado=${estado}`);
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar.");
      setFilas([]);
      return;
    }
    setFilas(((await res.json()) as { cancelaciones: Fila[] }).cancelaciones);
  }, [estado]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  useEffect(() => {
    async function cargarGuias() {
      const res = await apiFetch("/api/identity/guides");
      if (res.ok) setGuias(((await res.json()) as { guias: GuiaOpcion[] }).guias);
    }
    void cargarGuias();
  }, []);

  async function resolver(f: Fila, aprobar: boolean) {
    setOcupado(f.id);
    setError(null);
    setAviso(null);
    try {
      const reemplazo = reemplazos[f.id] ?? "";
      const res = await apiFetch(`/api/scheduling/cancelaciones/${f.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aprobar,
          reemplazoGuiaUserId: aprobar && reemplazo !== "" ? reemplazo : null,
        }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(c.error?.message ?? "No se pudo resolver.");
        return;
      }
      setAviso(
        !aprobar
          ? `Aviso de ${f.guia} rechazado: la sesión sigue con él.`
          : reemplazo === ""
            ? `Sesión del ${f.fecha} cancelada (cuenta en las horas de ${f.guia}).`
            : `Sesión del ${f.fecha} cubierta; cuenta como cancelada para ${f.guia}.`,
      );
      await cargar();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "80rem", margin: "0 auto" }}>
      <Link href="/panel/sesiones" style={{ fontSize: "0.85rem" }}>
        ← Sesiones
      </Link>
      <h1 style={{ fontSize: "1.6rem", margin: "0.4rem 0 0" }}>Cancelaciones de guías</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
        El guía avisa desde la sesión que no puede dictarla. Aprobar la cancela y cuenta en su
        control de horas; si eliges quién la cubre, el reemplazo es SOLO de esa sesión y no toca las
        siguientes. Rechazar = la dicta él.
      </p>

      <div style={{ display: "flex", gap: "0.4rem", margin: "1rem 0", flexWrap: "wrap" }}>
        {(["PENDIENTE", "APROBADA", "RECHAZADA", "TODAS"] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEstado(e)}
            style={{
              ...boton,
              background: estado === e ? "#eef2ff" : "white",
              borderColor: estado === e ? "var(--lgs-azul)" : "#e3e7f0",
            }}
          >
            {e === "TODAS" ? "Todas" : ESTADO[e].texto + "s"}
          </button>
        ))}
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {aviso !== null && <p style={{ color: "#1b5e20", fontWeight: 600 }}>{aviso}</p>}

      {filas === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : filas.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>No hay avisos de cancelación aquí.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                <th style={celda}>Sesión</th>
                <th style={celda}>Guía que cancela</th>
                <th style={celda}>Motivo</th>
                <th style={celda}>Estado</th>
                <th style={celda}>Decisión</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td style={{ ...celda, whiteSpace: "nowrap" }}>
                    {f.sessionId !== null ? (
                      <Link
                        href={`/panel/calendario/sesion/${f.sessionId}`}
                        style={{ fontWeight: 700 }}
                      >
                        {f.fecha}
                      </Link>
                    ) : (
                      f.fecha
                    )}{" "}
                    {horaDelSalon(f.startsAt, f.timezone)}
                    <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                      {[f.campania, f.curso, f.salon].filter((x) => x !== null).join(" · ")}
                    </div>
                  </td>
                  <td style={celda}>
                    {f.guia}
                    <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                      avisó {f.solicitante}
                    </div>
                  </td>
                  <td style={celda}>{f.motivo}</td>
                  <td style={celda}>
                    <span style={{ fontWeight: 700, color: ESTADO[f.estado].color }}>
                      {ESTADO[f.estado].texto}
                    </span>
                    {f.estado === "APROBADA" && (
                      <div style={{ fontSize: "0.78rem" }}>
                        {f.reemplazo !== null
                          ? `Cubrió ${f.reemplazo}`
                          : "Sin reemplazo: no se dictó"}
                      </div>
                    )}
                    {f.notaResolucion !== null && (
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.notaResolucion}
                      </div>
                    )}
                  </td>
                  <td style={celda}>
                    {f.estado === "PENDIENTE" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        <select
                          value={reemplazos[f.id] ?? ""}
                          onChange={(e) => setReemplazos((r) => ({ ...r, [f.id]: e.target.value }))}
                          style={{
                            padding: "0.35rem",
                            borderRadius: "0.45rem",
                            border: "1.5px solid #d8dce6",
                            fontSize: "0.8rem",
                          }}
                        >
                          <option value="">Sin reemplazo (se cancela)</option>
                          {guias
                            .filter((g) => g.id !== f.guiaUserId)
                            .map((g) => (
                              <option key={g.id} value={g.id}>
                                Cubre: {g.nombre ?? g.username}
                              </option>
                            ))}
                        </select>
                        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                          <SoloSi op="op.calendario.cancelacion_resolver">
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => void resolver(f, true)}
                              style={{
                                ...boton,
                                border: "none",
                                background: "#6a1b9a",
                                color: "white",
                              }}
                            >
                              Aprobar
                            </button>
                          </SoloSi>
                          <SoloSi op="op.calendario.cancelacion_resolver">
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => void resolver(f, false)}
                              style={boton}
                            >
                              Rechazar
                            </button>
                          </SoloSi>
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/** La página es una opción de Roles: sin ella, "No tienes acceso". */
export default function CancelacionesPage() {
  return (
    <ConOpcion op="op.sesiones.cancelaciones" volver="/panel/sesiones">
      <CancelacionesPageContenido />
    </ConOpcion>
  );
}
