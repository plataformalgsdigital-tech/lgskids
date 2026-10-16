"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";
import { numeroContrato } from "@/ui/numero-contrato";
import {
  FiltrosServicio,
  botonServicio,
  celdaServicio,
  qsFiltros,
  type FiltrosBase,
} from "../FiltrosServicio";
import { AgendarWelcomeModal } from "./AgendarWelcomeModal";
import { cuandoWelcome } from "./welcome-ui";
import { SoloSi } from "@/ui/SoloSi";

/**
 * Gestión de Reagendamientos (MOSAICO): los que FALTARON a un Welcome, agrupados
 * por la sesión perdida. "Reagendado al …" se DERIVA (tiene otro por delante); la
 * reserva perdida no se toca. Con 2 perdidos ya no se reagenda: va al video.
 */

interface Fila {
  reservaId: string;
  welcomeId: string;
  startsAt: string;
  guia: string;
  nivel: string;
  reagendadoA: string | null;
  perdidos: number;
  childPersonId: string;
  nombre: string;
  documento: string;
  pais: string;
  campania: string | null;
  curso: string | null;
  salon: string | null;
  apoderado: string | null;
  telefono: string | null;
  externalRef: string | null;
  contratoNumero: number | null;
}

export function ReagendamientosTab({ zona }: { zona: string }) {
  const [filtros, setFiltros] = useState<FiltrosBase>({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: "",
    hasta: "",
  });
  const [soloSinReagendar, setSoloSinReagendar] = useState(true);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [puedeReagendar, setPuedeReagendar] = useState(false);
  const [maxIntentos, setMaxIntentos] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agendando, setAgendando] = useState<Fila | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(
      `/api/scheduling/servicio/welcome?${qsFiltros(filtros, {
        vista: "reagendamientos",
        zona,
        soloSinReagendar: soloSinReagendar ? "1" : "",
      })}`,
    );
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar.");
      setFilas([]);
      return;
    }
    const d = (await res.json()) as {
      inasistentes: Fila[];
      puedeReagendar: boolean;
      maxIntentos: number;
    };
    setFilas(d.inasistentes);
    setPuedeReagendar(d.puedeReagendar);
    setMaxIntentos(d.maxIntentos);
  }, [filtros, soloSinReagendar, zona]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  // Agrupado por el Welcome perdido, del más reciente al más antiguo.
  const grupos: {
    welcomeId: string;
    startsAt: string;
    guia: string;
    nivel: string;
    filas: Fila[];
  }[] = [];
  for (const f of filas ?? []) {
    const g = grupos.find((x) => x.welcomeId === f.welcomeId);
    if (g !== undefined) g.filas.push(f);
    else
      grupos.push({
        welcomeId: f.welcomeId,
        startsAt: f.startsAt,
        guia: f.guia,
        nivel: f.nivel,
        filas: [f],
      });
  }
  const sinReagendar = (filas ?? []).filter((f) => f.reagendadoA === null).length;

  function exportar() {
    if (filas === null) return;
    descargarCsv(
      `welcome-reagendamientos-${new Date().toISOString().slice(0, 10)}`,
      [
        "nino",
        "documento",
        "contrato",
        "pais",
        "campania",
        "curso",
        "salon",
        "apoderado",
        "telefono",
        "welcome_perdido",
        "guia",
        "perdidos",
        "reagendado_a",
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
        f.telefono,
        `${cuandoWelcome(f.startsAt).fecha} ${cuandoWelcome(f.startsAt).hora}`,
        f.guia,
        f.perdidos,
        f.reagendadoA === null
          ? "Pendiente"
          : `${cuandoWelcome(f.reagendadoA).fecha} ${cuandoWelcome(f.reagendadoA).hora}`,
      ]),
    );
  }

  return (
    <>
      <FiltrosServicio filtros={filtros} onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}>
        <label
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "0.4rem",
            fontSize: "0.86rem",
            fontWeight: 600,
          }}
        >
          <input
            type="checkbox"
            checked={soloSinReagendar}
            onChange={(e) => setSoloSinReagendar(e.target.checked)}
          />
          Solo sin reagendar
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
            : `${String(filas.length)} inasistente(s) · ${String(sinReagendar)} sin reagendar · ${String(grupos.length)} sesión(es)`}
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
      {aviso !== null && <p style={{ color: "#1b5e20", fontWeight: 600 }}>{aviso}</p>}
      {filas === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : grupos.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>
          Nadie faltó a un Welcome con estos filtros. 🎉
        </p>
      ) : (
        grupos.map((g) => {
          const c = cuandoWelcome(g.startsAt);
          const pendientes = g.filas.filter((f) => f.reagendadoA === null).length;
          return (
            <section
              key={g.welcomeId}
              style={{
                marginBottom: "1rem",
                border: "1px solid #e3e7f0",
                borderRadius: "0.8rem",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "0.6rem 0.8rem",
                  background: "#f5f7fb",
                  fontSize: "0.88rem",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <strong>
                  Welcome del {c.fecha} · {c.hora} · {g.guia} · {g.nivel}
                </strong>
                <span style={{ color: "var(--texto-suave)" }}>
                  {g.filas.length} inasistente(s) · {pendientes} sin reagendar
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <tbody>
                    {g.filas.map((f) => (
                      <tr key={f.reservaId}>
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
                              numeroContrato({
                                externalRef: f.externalRef,
                                numero: f.contratoNumero,
                              }).numero
                            }
                          </div>
                        </td>
                        <td style={celdaServicio}>
                          {f.campania ?? "—"}
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
                        <td style={celdaServicio}>
                          {f.reagendadoA !== null ? (
                            <span style={{ color: "#1b5e20", fontWeight: 700 }}>
                              ✓ Reagendado al {cuandoWelcome(f.reagendadoA).fecha}
                            </span>
                          ) : (
                            <span style={{ color: "#b57a00", fontWeight: 700 }}>Pendiente</span>
                          )}
                          <div style={{ color: "var(--texto-suave)", fontSize: "0.76rem" }}>
                            {f.perdidos} de {maxIntentos} Welcome perdidos
                          </div>
                        </td>
                        <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                          {puedeReagendar &&
                            (f.perdidos >= maxIntentos ? (
                              <span
                                style={{ fontSize: "0.78rem", color: "#4527a0", fontWeight: 600 }}
                              >
                                → Video Welcome
                              </span>
                            ) : (
                              <button
                                type="button"
                                style={{
                                  ...botonServicio,
                                  padding: "0.3rem 0.7rem",
                                  fontSize: "0.8rem",
                                }}
                                onClick={() => {
                                  setAviso(null);
                                  setAgendando(f);
                                }}
                              >
                                {f.reagendadoA === null ? "Reagendar" : "Cambiar"}
                              </button>
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
      {agendando !== null && (
        <AgendarWelcomeModal
          nino={{ childPersonId: agendando.childPersonId, nombre: agendando.nombre }}
          aviso={`Faltó al Welcome del ${cuandoWelcome(agendando.startsAt).fecha}. La sesión perdida no se borra.`}
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
