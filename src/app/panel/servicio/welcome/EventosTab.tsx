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
  diaLocal,
  qsFiltros,
  rotuloServicio,
  type FiltrosBase,
} from "../FiltrosServicio";
import { ESTADO_WELCOME, cuandoWelcome, pastillaWelcome, type EstadoWelcome } from "./welcome-ui";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Eventos Welcome (MOSAICO: "Eventos WELCOME"): cada niño agendado y su estado.
 * "Sesiones" es el total de Welcome del niño, sin depender del filtro de fechas
 * (en MOSAICO lo hacía, y un rango corto mostraba menos de las que tuvo).
 */

interface Fila {
  reservaId: string;
  welcomeId: string;
  startsAt: string;
  guia: string;
  nivel: string;
  estado: EstadoWelcome;
  sesiones: number;
  agendadoPor: string | null;
  childPersonId: string;
  nombre: string;
  documento: string;
  username: string | null;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  apoderado: string | null;
  telefono: string | null;
  externalRef: string | null;
  contratoNumero: number | null;
}

export function EventosTab({ zona }: { zona: string }) {
  const [filtros, setFiltros] = useState<FiltrosBase>(() => ({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: diaLocal(-7),
    hasta: diaLocal(14),
  }));
  const [estado, setEstado] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(
      `/api/scheduling/servicio/welcome?${qsFiltros(filtros, { vista: "eventos", estado, zona })}`,
    );
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar.");
      setFilas([]);
      return;
    }
    setFilas(((await res.json()) as { agendados: Fila[] }).agendados);
  }, [filtros, estado, zona]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  function exportar() {
    if (filas === null) return;
    descargarCsv(
      `welcome-eventos-${filtros.desde}_${filtros.hasta}`,
      [
        "fecha",
        "hora",
        "zona",
        "guia",
        "nivel",
        "nino",
        "documento",
        "contrato",
        "usuario",
        "pais",
        "campania",
        "curso",
        "salon",
        "apoderado",
        "telefono",
        "sesiones",
        "estado",
        "agendado_por",
      ],
      filas.map((f) => {
        const c = cuandoWelcome(f.startsAt);
        return [
          c.fecha,
          c.hora,
          zona,
          f.guia,
          f.nivel,
          f.nombre,
          f.documento,
          numeroContrato({ externalRef: f.externalRef, numero: f.contratoNumero }).numero,
          f.username,
          f.pais,
          f.campania,
          f.curso,
          f.salon,
          f.apoderado,
          f.telefono,
          f.sesiones,
          ESTADO_WELCOME[f.estado].texto,
          f.agendadoPor ?? "el niño (enlace de perfil)",
        ];
      }),
    );
  }

  const cuenta = (e: EstadoWelcome) => (filas ?? []).filter((f) => f.estado === e).length;

  return (
    <>
      <FiltrosServicio filtros={filtros} onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}>
        <label>
          <span style={rotuloServicio}>Asistencia</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={campoServicio}>
            <option value="">Todos</option>
            {(Object.keys(ESTADO_WELCOME) as EstadoWelcome[]).map((e) => (
              <option key={e} value={e}>
                {ESTADO_WELCOME[e].texto}
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
          {filas === null
            ? ""
            : `${String(filas.length)} agendado(s) · ${String(cuenta("ASISTIO"))} asistieron · ${String(cuenta("NO_ASISTIO"))} no asistieron · ${String(cuenta("PENDIENTE"))} pendientes`}
        </span>
        <SoloSi op="op.servicio.welcome_csv">
          <button
            type="button"
            onClick={exportar}
            disabled={filas === null || filas.length === 0}
            style={botonServicio}
          >
            ⬇ Descargar CSV
          </button>
        </SoloSi>
      </div>
      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {filas === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : filas.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>No hay niños agendados con estos filtros.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                <th style={celdaServicio}>Welcome</th>
                <th style={celdaServicio}>Niño</th>
                <th style={celdaServicio}>Programa</th>
                <th style={celdaServicio}>Apoderado</th>
                <th style={celdaServicio}>Sesiones</th>
                <th style={celdaServicio}>Asistencia</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const c = cuandoWelcome(f.startsAt);
                return (
                  <tr key={f.reservaId}>
                    <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                      {c.fecha} · {c.hora}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.guia} · {f.nivel}
                      </div>
                    </td>
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
                      {f.campania ?? "Sin matrícula"}
                      <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                        {f.salon ?? ""}
                      </div>
                    </td>
                    <td style={celdaServicio}>
                      {f.apoderado ?? "—"}
                      {f.telefono !== null && (
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {f.telefono}
                        </div>
                      )}
                    </td>
                    <td style={celdaServicio}>{f.sesiones}</td>
                    <td style={celdaServicio}>
                      <span style={pastillaWelcome(f.estado)}>
                        {ESTADO_WELCOME[f.estado].texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
