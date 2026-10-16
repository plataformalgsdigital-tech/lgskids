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
import { SoloSi } from "@/ui/SoloSi";

/**
 * Servicio › Sesiones: qué pasó con las sesiones de un rango de días —por
 * defecto, las de AYER—. Realizada (el guía la registró), no realizada (pasó
 * y nadie la registró), cancelada (el guía avisó y administración la canceló
 * sin reemplazo) o suspendida (administración suspendió el día del salón).
 */

type Estado = "REALIZADA" | "NO_REALIZADA" | "CANCELADA" | "SUSPENDIDA" | "PROGRAMADA";

interface Fila {
  clave: string;
  sessionId: string | null;
  fecha: string;
  hora: string | null;
  tipo: string | null;
  campania: string | null;
  curso: string | null;
  salon: string;
  pais: string;
  guia: string | null;
  estado: Estado;
  detalle: string | null;
  canceloGuia: string | null;
  cubiertaPor: string | null;
  cancelacionPendiente: boolean;
  presentes: number;
  ausentes: number;
  justificados: number;
}

const ESTADO: Record<Estado, { texto: string; color: string; fondo: string }> = {
  REALIZADA: { texto: "Realizada", color: "#1b5e20", fondo: "#e8f5e9" },
  NO_REALIZADA: { texto: "No realizada", color: "#b71c1c", fondo: "#ffebee" },
  CANCELADA: { texto: "Cancelada (advisor)", color: "#6a1b9a", fondo: "#f3e5f5" },
  SUSPENDIDA: { texto: "Suspendida (admin)", color: "#e65100", fondo: "#fff3e0" },
  PROGRAMADA: { texto: "Programada", color: "#37474f", fondo: "#eceff1" },
};
const TIPO: Record<string, string> = { SESION: "Sesión", CLUB: "Club", TALLER: "Taller" };

export default function ServicioSesionesPage() {
  const ayer = diaLocal(-1);
  const [filtros, setFiltros] = useState<FiltrosBase>({
    buscar: "",
    campaignId: "",
    curso: "",
    classroomId: "",
    desde: ayer,
    hasta: ayer,
  });
  const [estado, setEstado] = useState("");
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(
      `/api/scheduling/servicio/sesiones?${qsFiltros(filtros, { estado })}`,
    );
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudo cargar la consulta.");
      setFilas([]);
      return;
    }
    setFilas(((await res.json()) as { sesiones: Fila[] }).sesiones);
  }, [filtros, estado]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  function exportar() {
    if (filas === null) return;
    descargarCsv(
      `sesiones-${filtros.desde}${filtros.hasta !== filtros.desde ? `_${filtros.hasta}` : ""}`,
      [
        "fecha",
        "hora",
        "tipo",
        "campania",
        "curso",
        "salon",
        "pais",
        "guia",
        "estado",
        "detalle",
        "cancelo_guia",
        "cubierta_por",
        "presentes",
        "ausentes",
        "justificados",
      ],
      filas.map((f) => [
        f.fecha,
        f.hora,
        f.tipo !== null ? (TIPO[f.tipo] ?? f.tipo) : null,
        f.campania,
        f.curso,
        f.salon,
        f.pais,
        f.guia,
        ESTADO[f.estado].texto,
        f.detalle,
        f.canceloGuia,
        f.cubiertaPor,
        f.presentes,
        f.ausentes,
        f.justificados,
      ]),
    );
  }

  const cuenta = (e: Estado) => (filas ?? []).filter((f) => f.estado === e).length;

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
          <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Sesiones</h1>
          <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
            Qué pasó con las sesiones: realizada, no realizada, cancelada por el guía (advisor) o
            suspendida por administración. Por defecto, las del día anterior; la fecha es la del
            salón.
          </p>
        </div>
        <SoloSi op="op.servicio.sesiones_csv">
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

      <FiltrosServicio
        filtros={filtros}
        onCambio={(c) => setFiltros((f) => ({ ...f, ...c }))}
        conUsuario={false}
      >
        <label>
          <span style={rotuloServicio}>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={campoServicio}>
            <option value="">Todos</option>
            {(Object.keys(ESTADO) as Estado[]).map((e) => (
              <option key={e} value={e}>
                {ESTADO[e].texto}
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
        <p style={{ color: "var(--texto-suave)" }}>No hay sesiones con estos filtros.</p>
      ) : (
        <>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", margin: "0 0 0.5rem" }}>
            {filas.length} · {cuenta("REALIZADA")} realizadas · {cuenta("NO_REALIZADA")} no
            realizadas · {cuenta("CANCELADA")} canceladas · {cuenta("SUSPENDIDA")} suspendidas
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f5f7fb" }}>
                  <th style={celdaServicio}>Fecha</th>
                  <th style={celdaServicio}>Salón</th>
                  <th style={celdaServicio}>Guía</th>
                  <th style={celdaServicio}>Estado</th>
                  <th style={celdaServicio}>Asistencia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const e = ESTADO[f.estado];
                  return (
                    <tr key={f.clave}>
                      <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                        {f.sessionId !== null ? (
                          <Link
                            href={`/panel/calendario/sesion/${f.sessionId}`}
                            style={{ fontWeight: 700 }}
                          >
                            {f.fecha}
                          </Link>
                        ) : (
                          f.fecha
                        )}
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {f.hora ?? "—"}
                          {f.tipo !== null ? ` · ${TIPO[f.tipo] ?? f.tipo}` : ""}
                        </div>
                      </td>
                      <td style={celdaServicio}>
                        {f.salon}
                        <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                          {[f.campania, f.curso, f.pais].filter((x) => x !== null).join(" · ")}
                        </div>
                      </td>
                      <td style={celdaServicio}>
                        {f.guia ?? "Sin guía"}
                        {f.cubiertaPor !== null && f.canceloGuia !== null && (
                          <div style={{ color: "#6a1b9a", fontSize: "0.78rem" }}>
                            Cubrió a {f.canceloGuia}
                          </div>
                        )}
                      </td>
                      <td style={celdaServicio}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.1rem 0.5rem",
                            borderRadius: "999px",
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            color: e.color,
                            background: e.fondo,
                          }}
                        >
                          {e.texto}
                        </span>
                        {f.cancelacionPendiente && (
                          <div style={{ color: "#6a1b9a", fontSize: "0.78rem" }}>
                            ⚠ El guía avisó que la cancela (pendiente)
                          </div>
                        )}
                        {f.detalle !== null && f.detalle !== "" && (
                          <div style={{ color: "var(--texto-suave)", fontSize: "0.78rem" }}>
                            {f.detalle}
                          </div>
                        )}
                        {f.estado === "NO_REALIZADA" && f.presentes + f.ausentes > 0 && (
                          <div style={{ color: "#b57a00", fontSize: "0.78rem" }}>
                            Tiene lista pasada pero el guía no la registró
                          </div>
                        )}
                      </td>
                      <td style={{ ...celdaServicio, whiteSpace: "nowrap" }}>
                        {f.sessionId === null
                          ? "—"
                          : `✔ ${String(f.presentes)} · ✖ ${String(f.ausentes)} · J ${String(f.justificados)}`}
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
