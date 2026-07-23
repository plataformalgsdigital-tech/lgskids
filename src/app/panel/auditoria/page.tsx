"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

interface Registro {
  id: string;
  actorUserId: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

const th: CSSProperties = {
  textAlign: "left",
  padding: "0.45rem 0.7rem",
  fontSize: "0.78rem",
  color: "var(--texto-suave)",
  borderBottom: "2px solid #e3e7f0",
};

const td: CSSProperties = {
  padding: "0.45rem 0.7rem",
  fontSize: "0.85rem",
  borderBottom: "1px solid #eef1f7",
  verticalAlign: "top",
};

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [accion, setAccion] = useState("");
  const [offset, setOffset] = useState(0);

  const cargar = useCallback(async (filtroAccion: string, nuevoOffset: number) => {
    const params = new URLSearchParams({ limit: "50", offset: String(nuevoOffset) });
    if (filtroAccion !== "") params.set("accion", filtroAccion);
    const res = await fetch(`/api/audit?${params}`);
    if (res.ok) {
      const data: { registros: Registro[] } = await res.json();
      setRegistros(data.registros);
      setOffset(nuevoOffset);
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar("", 0);
    }
    void inicial();
  }, [cargar]);

  return (
    <main style={{ padding: "2rem", maxWidth: "70rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.6rem" }}>Auditoría</h1>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <input
            placeholder="Filtrar por acción (ej. auth.login)…"
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void cargar(accion.trim(), 0);
            }}
            style={{
              padding: "0.5rem 0.7rem",
              borderRadius: "0.5rem",
              border: "1.5px solid #d8dce6",
              fontSize: "0.9rem",
              width: "18rem",
            }}
          />
          <button
            onClick={() => void cargar(accion.trim(), 0)}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #e3e7f0",
              background: "white",
              cursor: "pointer",
            }}
          >
            Filtrar
          </button>
        </div>
      </div>

      {registros === null ? (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>Cargando…</p>
      ) : registros.length === 0 ? (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>Sin registros.</p>
      ) : (
        <>
          <div style={{ marginTop: "1rem", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Fecha (su hora local)</th>
                  <th style={th}>Acción</th>
                  <th style={th}>Entidad</th>
                  <th style={th}>Detalle</th>
                  <th style={th}>IP</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.accion}</td>
                    <td style={td}>{r.entidad}</td>
                    <td
                      style={{
                        ...td,
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        maxWidth: "24rem",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {r.payload !== null ? JSON.stringify(r.payload) : "—"}
                    </td>
                    <td style={td}>{r.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
            {offset > 0 && (
              <button
                onClick={() => void cargar(accion.trim(), Math.max(offset - 50, 0))}
                style={{
                  padding: "0.45rem 1rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e3e7f0",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                ← Más recientes
              </button>
            )}
            {registros.length === 50 && (
              <button
                onClick={() => void cargar(accion.trim(), offset + 50)}
                style={{
                  padding: "0.45rem 1rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e3e7f0",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Más antiguos →
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
