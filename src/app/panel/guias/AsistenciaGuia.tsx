"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { SesionModal } from "../calendario/SesionModal";

/**
 * Pestaña "Asistencia" de la ficha del guía (2026-11-07): las sesiones que DICTA
 * —con el guía efectivo de cada una: un reemplazo de un día cuenta para quien lo
 * cubre— y, al hacer clic, el MISMO modal del calendario para pasar lista y
 * registrarla. No hay un segundo camino para marcar: el modal usa las rutas de
 * siempre (`marcarAsistencia`, regla 4) con sus permisos.
 */

interface SesionGuia {
  id: string;
  fecha: string;
  horaLocal: string;
  tipo: string;
  salon: string;
  cursoTipo: string;
  campania: string;
  pais: string;
  ocupados: number;
  asistieron: number;
  cerrada: boolean;
  startsAt: string;
  suspendida: boolean;
  alcance: { etiqueta: string } | null;
}

type Estado = "REGISTRADA" | "POR_REGISTRAR" | "PROGRAMADA" | "SUSPENDIDA";
type Filtro = "TODAS" | Estado;

const ESTADO: Record<Estado, { texto: string; fondo: string; color: string }> = {
  POR_REGISTRAR: { texto: "Por registrar", fondo: "#fff3e0", color: "#e65100" },
  REGISTRADA: { texto: "Registrada", fondo: "#e8f5e9", color: "#1b5e20" },
  PROGRAMADA: { texto: "Programada", fondo: "#e3f2fd", color: "#0d47a1" },
  SUSPENDIDA: { texto: "Suspendida", fondo: "#eceff1", color: "#455a64" },
};
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: "TODAS", texto: "Todas" },
  { valor: "POR_REGISTRAR", texto: "Por registrar" },
  { valor: "REGISTRADA", texto: "Registradas" },
  { valor: "PROGRAMADA", texto: "Próximas" },
  { valor: "SUSPENDIDA", texto: "Suspendidas" },
];
const TIPO: Record<string, string> = { SESION: "Sesión", CLUB: "Club", TALLER: "Taller" };
const PAIS: Record<string, string> = { CL: "Chile", CO: "Colombia", EC: "Ecuador", PE: "Perú" };

/** Una fecha YYYY-MM-DD corrida `dias` días. */
function corrida(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function estadoDe(s: SesionGuia, ahora: number): Estado {
  if (s.suspendida) return "SUSPENDIDA";
  if (s.cerrada) return "REGISTRADA";
  return new Date(s.startsAt).getTime() <= ahora ? "POR_REGISTRAR" : "PROGRAMADA";
}

const campo: CSSProperties = {
  padding: "0.4rem 0.55rem",
  borderRadius: "0.5rem",
  border: "1px solid #d8dce6",
  fontSize: "0.85rem",
};
const th: CSSProperties = {
  padding: "0.5rem 0.6rem",
  fontSize: "0.72rem",
  textAlign: "left",
  whiteSpace: "nowrap",
};
const td: CSSProperties = { padding: "0.55rem 0.6rem", fontSize: "0.84rem", verticalAlign: "top" };

export function AsistenciaGuia({ guiaUserId }: { guiaUserId: string }) {
  const [desde, setDesde] = useState(() => corrida(-14));
  const [hasta, setHasta] = useState(() => corrida(7));
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [sesiones, setSesiones] = useState<SesionGuia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  // "Ahora" se fija al cargar: mirar el reloj mientras se pinta no es puro.
  const [ahora, setAhora] = useState(0);

  const cargar = useCallback(async () => {
    setError(null);
    const res = await apiFetch(
      `/api/scheduling/guias/${guiaUserId}/sesiones?from=${desde}&to=${hasta}`,
    );
    if (!res.ok) {
      const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
      setError(c.error?.message ?? "No se pudieron cargar las sesiones.");
      setSesiones([]);
      return;
    }
    const d = (await res.json()) as { sesiones: SesionGuia[] };
    setAhora(Date.now());
    setSesiones(d.sesiones);
  }, [guiaUserId, desde, hasta]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  const conEstado = useMemo(
    () =>
      (sesiones ?? [])
        .map((s) => ({ ...s, estado: estadoDe(s, ahora) }))
        // Lo más reciente primero: lo que hay que registrar está arriba.
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    [sesiones, ahora],
  );
  const cuenta = (e: Estado) => conEstado.filter((s) => s.estado === e).length;
  const visibles = filtro === "TODAS" ? conEstado : conEstado.filter((s) => s.estado === filtro);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--texto-suave)" }}>
        Las sesiones que dicta este guía (si un día lo cubrió otro, sale en la de quien la cubrió).
        Haz clic en una para pasar lista y registrarla.
      </p>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
            fontSize: "0.75rem",
            fontWeight: 700,
          }}
        >
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            style={campo}
          />
        </label>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
            fontSize: "0.75rem",
            fontWeight: 700,
          }}
        >
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            style={campo}
          />
        </label>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {FILTROS.map((f) => {
            const activo = filtro === f.valor;
            const n = f.valor === "TODAS" ? conEstado.length : cuenta(f.valor);
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => setFiltro(f.valor)}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: "999px",
                  border: activo ? "1.5px solid var(--lgs-azul)" : "1px solid #d8dce6",
                  background: activo ? "var(--lgs-azul)" : "white",
                  color: activo ? "white" : "inherit",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                {f.texto} ({n})
              </button>
            );
          })}
        </div>
      </div>

      {error !== null && (
        <p role="alert" style={{ margin: 0, color: "#c62828" }}>
          {error}
        </p>
      )}
      {sesiones === null ? (
        <p style={{ margin: 0, color: "var(--texto-suave)" }}>Cargando…</p>
      ) : visibles.length === 0 ? (
        <p style={{ margin: 0, color: "var(--texto-suave)" }}>
          {conEstado.length === 0
            ? "Este guía no tiene sesiones en ese rango."
            : "Ninguna sesión con ese estado."}
        </p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #e3e7f0", borderRadius: "0.7rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f6f7fb" }}>
                {["Fecha", "Hora", "Salón", "Tipo", "Inscritos", "Asistieron", "Estado", ""].map(
                  (h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.map((s) => {
                const e = ESTADO[s.estado];
                return (
                  <tr
                    key={s.id}
                    onClick={() => setAbierta(s.id)}
                    style={{ borderTop: "1px solid #eef0f5", cursor: "pointer" }}
                  >
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {new Date(`${s.fecha}T12:00:00`).toLocaleDateString("es", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {s.horaLocal}
                      <div style={{ fontSize: "0.7rem", color: "var(--texto-suave)" }}>
                        hora de {PAIS[s.pais] ?? s.pais}
                      </div>
                    </td>
                    <td style={td}>
                      <strong>{s.alcance?.etiqueta ?? s.salon}</strong>
                      <div style={{ fontSize: "0.72rem", color: "var(--texto-suave)" }}>
                        {s.campania} · {s.cursoTipo}
                      </div>
                    </td>
                    <td style={td}>{TIPO[s.tipo] ?? s.tipo}</td>
                    <td style={{ ...td, textAlign: "center" }}>{s.ocupados}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {s.estado === "PROGRAMADA" ? "—" : s.asistieron}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          padding: "0.12rem 0.5rem",
                          borderRadius: "999px",
                          background: e.fondo,
                          color: e.color,
                          fontWeight: 700,
                          fontSize: "0.72rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.texto}
                      </span>
                    </td>
                    <td
                      style={{
                        ...td,
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                        color: "var(--lgs-azul)",
                      }}
                    >
                      {s.estado === "POR_REGISTRAR" ? "Pasar lista →" : "Abrir →"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {abierta !== null && (
        <SesionModal
          sessionId={abierta}
          onCerrar={() => {
            setAbierta(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}
