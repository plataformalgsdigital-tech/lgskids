"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

interface Resumen {
  mes: string;
  asistencia: {
    salon: string;
    campania: string;
    timezone: string;
    sesionesDelMes: number;
    presentes: number;
    ausentes: number;
    justificados: number;
    porcentajeAsistencia: number | null;
  }[];
  ocupacion: {
    salon: string;
    campania: string;
    curso: string;
    cupo: number;
    matriculados: number;
    disponibles: number;
  }[];
  contratos: {
    pais: string;
    pendientes: number;
    aprobados: number;
    enPausa: number;
    inactivos: number;
    porVencer30d: number;
  }[];
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
  fontSize: "0.88rem",
  borderBottom: "1px solid #eef1f7",
};

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function ReportesPage() {
  const [mes, setMes] = useState(mesActual());
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (m: string) => {
    setError(null);
    const res = await fetch(`/api/reporting/summary?mes=${m}`);
    if (!res.ok) {
      setError("No se pudo cargar el reporte.");
      return;
    }
    setDatos((await res.json()) as Resumen);
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar(mesActual());
    }
    void inicial();
  }, [cargar]);

  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.6rem" }}>Reportes</h1>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9rem" }}>
          Mes:
          <input
            type="month"
            value={mes}
            onChange={(e) => {
              setMes(e.target.value);
              if (e.target.value !== "") void cargar(e.target.value);
            }}
            style={{
              padding: "0.45rem 0.6rem",
              borderRadius: "0.5rem",
              border: "1.5px solid #d8dce6",
            }}
          />
        </label>
      </div>
      {error !== null && (
        <p role="alert" style={{ marginTop: "0.75rem", color: "#c62828" }}>
          {error}
        </p>
      )}
      {datos === null ? (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>Cargando…</p>
      ) : (
        <>
          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
              📋 Asistencia por salón — {datos.mes} (mes operativo de cada salón)
            </h2>
            {datos.asistencia.length === 0 ? (
              <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem" }}>
                Sin sesiones en ese mes.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Salón</th>
                      <th style={th}>Campaña</th>
                      <th style={th}>Sesiones</th>
                      <th style={th}>Presentes</th>
                      <th style={th}>Ausentes</th>
                      <th style={th}>Justificados</th>
                      <th style={th}>% Asistencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.asistencia.map((fila) => (
                      <tr key={`${fila.campania}-${fila.salon}`}>
                        <td style={td}>{fila.salon}</td>
                        <td style={td}>{fila.campania}</td>
                        <td style={td}>{fila.sesionesDelMes}</td>
                        <td style={{ ...td, color: "#1b5e20" }}>{fila.presentes}</td>
                        <td style={{ ...td, color: "#c62828" }}>{fila.ausentes}</td>
                        <td style={{ ...td, color: "#8a6d00" }}>{fila.justificados}</td>
                        <td style={{ ...td, fontWeight: 700 }}>
                          {fila.porcentajeAsistencia !== null
                            ? `${fila.porcentajeAsistencia}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ marginTop: "1.75rem" }}>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>🪑 Ocupación de salones</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Salón</th>
                    <th style={th}>Campaña</th>
                    <th style={th}>Curso</th>
                    <th style={th}>Cupo</th>
                    <th style={th}>Matriculados</th>
                    <th style={th}>Disponibles</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.ocupacion.map((fila) => (
                    <tr key={`${fila.campania}-${fila.salon}`}>
                      <td style={td}>{fila.salon}</td>
                      <td style={td}>{fila.campania}</td>
                      <td style={td}>{fila.curso}</td>
                      <td style={td}>{fila.cupo}</td>
                      <td style={td}>{fila.matriculados}</td>
                      <td
                        style={{
                          ...td,
                          fontWeight: 700,
                          color: fila.disponibles === 0 ? "#c62828" : "#1b5e20",
                        }}
                      >
                        {fila.disponibles}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginTop: "1.75rem" }}>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
              📄 Contratos por país (según su alcance)
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>País</th>
                    <th style={th}>Pendientes</th>
                    <th style={th}>Aprobados</th>
                    <th style={th}>En pausa</th>
                    <th style={th}>Inactivos</th>
                    <th style={th}>Por vencer (30 d)</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.contratos.map((fila) => (
                    <tr key={fila.pais}>
                      <td style={{ ...td, fontWeight: 700 }}>{fila.pais}</td>
                      <td style={td}>{fila.pendientes}</td>
                      <td style={{ ...td, color: "#1b5e20" }}>{fila.aprobados}</td>
                      <td style={td}>{fila.enPausa}</td>
                      <td style={td}>{fila.inactivos}</td>
                      <td
                        style={{
                          ...td,
                          color: fila.porVencer30d > 0 ? "#8a6d00" : "inherit",
                          fontWeight: 700,
                        }}
                      >
                        {fila.porVencer30d}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
