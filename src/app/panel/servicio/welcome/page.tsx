"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { descargarCsv } from "@/ui/csv";
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

/**
 * Servicio › Welcome: los niños agendados en Welcome y si asistieron. Abre en
 * la última semana y las dos próximas, para ver a la vez quién faltó y quién
 * viene. El Welcome es un instante: fecha y hora van en el reloj de quien mira.
 */

interface Agendado {
  reservaId: string;
  welcomeId: string;
  startsAt: string;
  duracionMin: number;
  guia: string;
  nivel: string;
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
  asistio: boolean | null;
  agendadoPor: string | null;
}

const ASISTENCIA = [
  { valor: "", texto: "Todos" },
  { valor: "SI", texto: "Asistieron" },
  { valor: "NO", texto: "No asistieron" },
  { valor: "SIN_MARCAR", texto: "Sin pasar lista" },
];

function cuando(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" }),
    hora: d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
  };
}

function textoAsistio(a: Agendado): { texto: string; color: string } {
  if (a.asistio === true) return { texto: "Asistió", color: "#2e7d32" };
  if (a.asistio === false) return { texto: "No asistió", color: "#c62828" };
  // Sin marca: si ya pasó, falta pasar lista; si no, todavía no ocurre.
  return new Date(a.startsAt).getTime() + a.duracionMin * 60_000 < Date.now()
    ? { texto: "Sin pasar lista", color: "#b57a00" }
    : { texto: "Próximo", color: "var(--texto-suave)" };
}

export default function ServicioWelcomePage() {
  const [filtros, setFiltros] = useState<FiltrosBase>(() => ({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: diaLocal(-7),
    hasta: diaLocal(14),
  }));
  const [asistencia, setAsistencia] = useState("");
  const [filas, setFilas] = useState<Agendado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(
      `/api/scheduling/servicio/welcome?${qsFiltros(filtros, { asistencia, zona })}`,
    );
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar la consulta.");
      setFilas([]);
      return;
    }
    setFilas(((await res.json()) as { agendados: Agendado[] }).agendados);
  }, [filtros, asistencia, zona]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 300);
    return () => clearTimeout(t);
  }, [cargar]);

  function exportar() {
    if (filas === null) return;
    descargarCsv(
      `welcome-${filtros.desde}_${filtros.hasta}`,
      [
        "fecha",
        "hora",
        "zona",
        "guia",
        "nivel",
        "nino",
        "documento",
        "usuario",
        "pais",
        "campania",
        "curso",
        "salon",
        "apoderado",
        "telefono",
        "asistencia",
        "agendado_por",
      ],
      filas.map((a) => {
        const c = cuando(a.startsAt);
        return [
          c.fecha,
          c.hora,
          zona,
          a.guia,
          a.nivel,
          a.nombre,
          a.documento,
          a.username,
          a.pais,
          a.campania,
          a.curso,
          a.salon,
          a.apoderado,
          a.telefono,
          textoAsistio(a).texto,
          a.agendadoPor ?? "el niño (enlace de perfil)",
        ];
      }),
    );
  }

  const resumen =
    filas === null
      ? null
      : {
          si: filas.filter((a) => a.asistio === true).length,
          no: filas.filter((a) => a.asistio === false).length,
        };

  return (
    <main style={{ padding: "2rem", maxWidth: "84rem", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 30rem" }}>
          <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Welcome</h1>
          <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
            Niños agendados en Welcome y si asistieron. Campaña, curso y salón son los de la
            matrícula del niño. Fecha y hora en tu reloj ({zona}).
          </p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={filas === null || filas.length === 0}
          style={botonServicio}
        >
          ⬇ Descargar CSV
        </button>
      </div>

      <FiltrosServicio filtros={filtros} onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}>
        <label>
          <span style={rotuloServicio}>Asistencia</span>
          <select
            value={asistencia}
            onChange={(e) => setAsistencia(e.target.value)}
            style={campoServicio}
          >
            {ASISTENCIA.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
      </FiltrosServicio>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600 }}>
          {error}
        </p>
      )}

      {filas === null ? (
        <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>
      ) : filas.length === 0 ? (
        <p style={{ color: "var(--texto-suave)" }}>
          No hay niños agendados en Welcome con estos filtros.
        </p>
      ) : (
        <>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", margin: "0 0 0.5rem" }}>
            {filas.length} agendado{filas.length === 1 ? "" : "s"}
            {resumen !== null &&
              ` · ${String(resumen.si)} asistieron · ${String(resumen.no)} no asistieron`}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                  <th style={celdaServicio}>Welcome</th>
                  <th style={celdaServicio}>Niño</th>
                  <th style={celdaServicio}>Programa</th>
                  <th style={celdaServicio}>Apoderado</th>
                  <th style={celdaServicio}>Asistencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((a) => {
                  const c = cuando(a.startsAt);
                  const est = textoAsistio(a);
                  return (
                    <tr key={a.reservaId}>
                      <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                        {c.fecha} · {c.hora}
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {a.guia} · {a.nivel}
                        </div>
                      </td>
                      <td style={celdaServicio}>
                        <Link
                          href={`/panel/personas/${a.childPersonId}`}
                          style={{ fontWeight: 700 }}
                        >
                          {a.nombre}
                        </Link>
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {a.documento} · {a.username ?? "sin usuario"} · {a.pais}
                        </div>
                      </td>
                      <td style={celdaServicio}>
                        {a.campania ?? "Sin matrícula"}
                        {a.salon !== null && (
                          <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                            {a.salon}
                          </div>
                        )}
                      </td>
                      <td style={celdaServicio}>
                        {a.apoderado ?? "—"}
                        {a.telefono !== null && a.telefono !== "" && (
                          <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                            {a.telefono}
                          </div>
                        )}
                      </td>
                      <td style={{ ...celdaServicio, fontWeight: 700, color: est.color }}>
                        {est.texto}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
