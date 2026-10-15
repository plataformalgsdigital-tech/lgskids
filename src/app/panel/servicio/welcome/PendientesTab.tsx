"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";
import { numeroContrato } from "@/ui/numero-contrato";
import {
  FiltrosServicio,
  botonServicio,
  campoServicio,
  celdaServicio,
  qsFiltros,
  rotuloServicio,
  type FiltrosBase,
} from "../FiltrosServicio";
import { AgendarWelcomeModal } from "./AgendarWelcomeModal";
import { MOTIVO_PENDIENTE } from "./welcome-ui";

/**
 * Pendientes de agendar (MOSAICO): niños matriculados que no tienen ningún
 * Welcome, con el motivo (derivado). Es una cola de trabajo: lo más antiguo
 * primero, sin filtro de fechas.
 */

interface Fila {
  childPersonId: string;
  nombre: string;
  documento: string;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  apoderado: string | null;
  telefonoApoderado: string | null;
  telefono: string | null;
  externalRef: string | null;
  contratoNumero: number | null;
  motivo: string;
  pendienteDesde: string | null;
}

export function PendientesTab() {
  const [filtros, setFiltros] = useState<FiltrosBase>({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: "",
    hasta: "",
  });
  const [motivo, setMotivo] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [puedeReagendar, setPuedeReagendar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agendando, setAgendando] = useState<Fila | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(
      `/api/scheduling/servicio/welcome?${qsFiltros(filtros, { vista: "pendientes", motivo })}`,
    );
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar.");
      setFilas([]);
      return;
    }
    const d = (await res.json()) as { pendientes: Fila[]; puedeReagendar: boolean };
    setFilas(d.pendientes);
    setPuedeReagendar(d.puedeReagendar);
  }, [filtros, motivo]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  function exportar() {
    if (filas === null) return;
    descargarCsv(
      `welcome-pendientes-${new Date().toISOString().slice(0, 10)}`,
      [
        "nino",
        "documento",
        "contrato",
        "pais",
        "campania",
        "curso",
        "salon",
        "apoderado",
        "telefono_apoderado",
        "motivo",
        "pendiente_desde",
      ],
      filas.map((f) => [
        f.nombre,
        f.documento,
        numeroContrato({ externalRef: f.externalRef, numero: f.contratoNumero }).numero,
        f.pais,
        f.campania,
        f.curso,
        f.salon,
        f.apoderado,
        f.telefonoApoderado,
        MOTIVO_PENDIENTE[f.motivo]?.texto ?? f.motivo,
        f.pendienteDesde?.slice(0, 10) ?? "",
      ]),
    );
  }

  return (
    <>
      <FiltrosServicio
        filtros={filtros}
        onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
        conFechas={false}
      >
        <label>
          <span style={rotuloServicio}>Motivo</span>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={campoServicio}>
            <option value="">Todos</option>
            {Object.entries(MOTIVO_PENDIENTE).map(([v, m]) => (
              <option key={v} value={v}>
                {m.texto}
              </option>
            ))}
          </select>
        </label>
      </FiltrosServicio>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
          {filas === null ? "" : `${String(filas.length)} niño(s) sin Welcome`}
        </span>
        <button
          type="button"
          onClick={exportar}
          disabled={filas === null || filas.length === 0}
          style={botonServicio}
        >
          ⬇ Descargar CSV
        </button>
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
        <p style={{ color: "var(--texto-suave)" }}>Todos los niños tienen su Welcome. 🎉</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                <th style={celdaServicio}>Niño</th>
                <th style={celdaServicio}>Contacto</th>
                <th style={celdaServicio}>Programa</th>
                <th style={celdaServicio}>Motivo</th>
                <th style={celdaServicio}>Pendiente desde</th>
                <th style={celdaServicio} />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const m = MOTIVO_PENDIENTE[f.motivo];
                return (
                  <tr key={f.childPersonId}>
                    <td style={celdaServicio}>
                      <Link
                        href={`/panel/personas/${f.childPersonId}`}
                        target="_blank"
                        style={{ fontWeight: 700 }}
                      >
                        {f.nombre}
                      </Link>
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.documento} ·{" "}
                        {
                          numeroContrato({ externalRef: f.externalRef, numero: f.contratoNumero })
                            .numero
                        }{" "}
                        · {f.pais}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      {f.apoderado ?? "—"}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.telefonoApoderado ?? f.telefono ?? "sin teléfono"}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      {f.campania ?? "—"}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {[f.curso, f.salon].filter((x) => x !== null).join(" · ")}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      {m !== undefined && (
                        <span
                          style={{
                            padding: "0.1rem 0.5rem",
                            borderRadius: "999px",
                            fontWeight: 700,
                            fontSize: "0.76rem",
                            color: m.color,
                            background: m.fondo,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {m.texto}
                        </span>
                      )}
                    </td>
                    <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                      {f.pendienteDesde !== null
                        ? new Date(f.pendienteDesde).toLocaleDateString("es")
                        : "—"}
                    </td>
                    <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                      {puedeReagendar && (
                        <button
                          type="button"
                          style={{ ...botonServicio, padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                          onClick={() => {
                            setAviso(null);
                            setAgendando(f);
                          }}
                        >
                          Agendar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {agendando !== null && (
        <AgendarWelcomeModal
          nino={{ childPersonId: agendando.childPersonId, nombre: agendando.nombre }}
          onCerrar={() => setAgendando(null)}
          onAgendado={(t) => {
            setAgendando(null);
            setAviso(t);
            void cargar();
          }}
        />
      )}
    </>
  );
}
