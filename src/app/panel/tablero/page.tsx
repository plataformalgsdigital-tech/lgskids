"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";
import { Personaje } from "@/ui/Personaje";

/**
 * TABLERO: pantalla de entrada de administración y guía.
 *
 * El banner de campañas es el bloque fijo (lo ve todo el que entra); lo demás
 * llega ya recortado por permisos desde el servidor, así que aquí basta con
 * dibujar lo que vino.
 */

interface Campania {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  finalVenta: string | null;
  estado: string;
}
interface Tablero {
  esGuia: boolean;
  campanias: Campania[];
  resumen: {
    salonesActivos: number;
    salonesSinGuia: number;
    cuposTotales: number;
    cuposOcupados: number;
    reservasPendientes: number;
  } | null;
  salonesSinGuia: { id: string; nombre: string; campania: string }[];
  ocupacion: { salon: string; cupo: number; activas: number; ocupacion: number | null }[];
  contratos: { pais: string; aprobados: number; pendientes: number; porVencer30d: number }[];
  guia: { salones: number; ninos: number; clasesHoy: number; sesionesSinMarcar: number } | null;
  clasesDeHoy: {
    sessionId: string;
    salon: string;
    tipo: string;
    startsAt: string;
    inscritos: number;
    marcadas: number;
  }[];
  sesionesSinMarcar: { sessionId: string; salon: string; fecha: string; inscritos: number }[];
}

const tarjeta: CSSProperties = {
  background: "white",
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1rem 1.1rem",
};

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fechaCorta(f: string): string {
  return new Date(`${f}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function Cifra({
  n,
  titulo,
  pie,
  color,
}: {
  n: string | number;
  titulo: string;
  pie?: string;
  color: string;
}) {
  return (
    <div style={{ ...tarjeta, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: "1.85rem", fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>
        {n}
      </div>
      <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>{titulo}</div>
      {pie !== undefined && (
        <div style={{ fontSize: "0.74rem", color: "var(--texto-suave)" }}>{pie}</div>
      )}
    </div>
  );
}

export default function TableroPage() {
  const [data, setData] = useState<Tablero | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await apiFetch("/api/panel/tablero");
      if (!res.ok) {
        setError("No se pudo cargar el tablero.");
        return;
      }
      setData((await res.json()) as Tablero);
    } catch {
      setError("Error de conexión.");
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  if (error !== null) {
    return <p style={{ color: "#c62828", fontWeight: 600 }}>{error}</p>;
  }
  if (data === null) {
    return <p style={{ color: "var(--texto-suave)" }}>Cargando…</p>;
  }

  const enMatricula = data.campanias.filter((c) => c.estado === "EN_MATRICULA");
  const activas = data.campanias.filter((c) => c.estado === "ACTIVA");
  const destacada = enMatricula[0] ?? activas[0] ?? null;
  const ocupacionPct =
    data.resumen !== null && data.resumen.cuposTotales > 0
      ? Math.round((data.resumen.cuposOcupados / data.resumen.cuposTotales) * 100)
      : null;
  const contratosVigentes = data.contratos.reduce((s, c) => s + c.aprobados, 0);
  const porVencer = data.contratos.reduce((s, c) => s + c.porVencer30d, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      {/* ── Banner de campañas: el bloque que ven todos ────────── */}
      <section
        style={{
          borderRadius: "0.9rem",
          padding: "1.3rem 1.4rem",
          background: "linear-gradient(120deg, var(--lgs-purpura), var(--lgs-azul) 58%, var(--lgs-cian))",
          color: "white",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "1rem",
          alignItems: "end",
          overflow: "hidden",
        }}
      >
        <div>
          <span style={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.12em", opacity: 0.85 }}>
            {destacada !== null ? "CAMPAÑA EN CURSO" : "CAMPAÑAS"}
          </span>
          <h1 style={{ margin: "0.15rem 0 0.3rem", fontSize: "1.45rem", fontWeight: 900 }}>
            {destacada !== null
              ? `${destacada.nombre} · ${destacada.estado === "EN_MATRICULA" ? "en matrícula" : "activa"}`
              : "No hay campañas abiertas"}
          </h1>
          <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.93, maxWidth: "34rem" }}>
            {destacada === null
              ? "Cuando se cree una campaña, aquí verás su estado y sus fechas."
              : destacada.estado === "EN_MATRICULA"
                ? "Todavía pueden entrar niños nuevos. Al cerrar la matrícula, la campaña pasa a activa."
                : "La matrícula ya cerró; los salones siguen su horario fijo."}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.75rem" }}>
            {destacada !== null && (
              <>
                <span style={pastilla}>Inicio · {fechaCorta(destacada.inicio)}</span>
                {destacada.finalVenta !== null && (
                  <span style={pastilla}>Cierre matrícula · {fechaCorta(destacada.finalVenta)}</span>
                )}
                <span style={pastilla}>Fin · {fechaCorta(destacada.fin)}</span>
              </>
            )}
            {enMatricula.length > 1 && (
              <span style={pastilla}>+{enMatricula.length - 1} en matrícula</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.1rem" }}>
          {data.esGuia && data.resumen === null ? (
            <>
              <Personaje quien="simba-alegre" alto="6rem" className="lgs-float" />
              <Personaje quien="rocky-alegre" alto="6rem" className="lgs-float" />
            </>
          ) : (
            <>
              <Personaje quien="emma-celebrando" alto="7.5rem" className="lgs-float" />
              <Personaje quien="simba-alegre" alto="6rem" className="lgs-float" />
              <Personaje quien="rocky-alegre" alto="6rem" className="lgs-float" />
              <Personaje quien="coco" alto="5.6rem" className="lgs-float" />
            </>
          )}
        </div>
      </section>

      {/* ── Cifras de operación ───────────────────────────────── */}
      {data.resumen !== null && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: "0.75rem" }}>
          {data.contratos.length > 0 && (
            <Cifra
              n={contratosVigentes}
              titulo="Contratos vigentes"
              pie={data.contratos.map((c) => `${c.pais} ${String(c.aprobados)}`).join(" · ")}
              color="var(--lgs-azul)"
            />
          )}
          <Cifra
            n={ocupacionPct !== null ? `${String(ocupacionPct)}%` : "—"}
            titulo="Ocupación de salones"
            pie={`${String(data.resumen.cuposOcupados)} de ${String(data.resumen.cuposTotales)} cupos`}
            color="var(--lgs-verde)"
          />
          <Cifra
            n={data.resumen.salonesActivos}
            titulo="Salones abiertos"
            pie={`${String(data.resumen.salonesSinGuia)} sin guía`}
            color="var(--lgs-cian)"
          />
          <Cifra
            n={data.resumen.reservasPendientes}
            titulo="Reservas por aprobar"
            pie="matrículas reservadas"
            color="var(--lgs-amarillo)"
          />
        </div>
      )}

      {/* ── Cifras del guía ───────────────────────────────────── */}
      {data.guia !== null && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: "0.75rem" }}>
          <Cifra n={data.guia.clasesHoy} titulo="Clases hoy" color="var(--lgs-azul)" />
          <Cifra
            n={data.guia.sesionesSinMarcar}
            titulo="Asistencia por marcar"
            pie="últimos 14 días"
            color="var(--lgs-amarillo)"
          />
          <Cifra n={data.guia.ninos} titulo="Mis niños" color="var(--lgs-cian)" />
          <Cifra n={data.guia.salones} titulo="Mis salones" color="var(--lgs-verde)" />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "0.9rem" }} className="tablero-dos">
        {/* ── Clases de hoy ───────────────────────────────────── */}
        <section style={tarjeta}>
          <h2 style={{ fontSize: "0.96rem", fontWeight: 800, marginBottom: "0.8rem" }}>
            🗓️ Clases de hoy
          </h2>
          {data.clasesDeHoy.length === 0 ? (
            <p style={{ color: "var(--texto-suave)" }}>No hay clases programadas para hoy.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {data.clasesDeHoy.map((c) => {
                const completa = c.inscritos > 0 && c.marcadas >= c.inscritos;
                return (
                  <div
                    key={c.sessionId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.6rem",
                      padding: "0.55rem 0.75rem",
                      borderRadius: "0.6rem",
                      background: "#fafbfe",
                      borderLeft: `3px solid ${c.tipo === "CLUB" ? "var(--lgs-amarillo)" : "var(--lgs-azul)"}`,
                      flexWrap: "wrap",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>
                      <b>{hora(c.startsAt)}</b> · {c.salon}
                      {c.tipo === "CLUB" && " (club)"}
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "var(--texto-suave)" }}>
                      {c.inscritos} niños ·{" "}
                      <b style={{ color: completa ? "#1b5e20" : "var(--texto-suave)" }}>
                        {completa ? "asistencia marcada" : `${String(c.marcadas)} marcadas`}
                      </b>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Requiere atención ───────────────────────────────── */}
        <section style={tarjeta}>
          <h2 style={{ fontSize: "0.96rem", fontWeight: 800, marginBottom: "0.8rem" }}>
            ⚠️ Requiere atención
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {data.sesionesSinMarcar.length > 0 && (
              <Aviso
                color="#c62060"
                texto={`${String(data.sesionesSinMarcar.length)} sesiones sin asistencia`}
                detalle={data.sesionesSinMarcar
                  .slice(0, 3)
                  .map((s) => `${s.salon} · ${fechaCorta(s.fecha)}`)
                  .join(" — ")}
              />
            )}
            {data.salonesSinGuia.length > 0 && (
              <Aviso
                color="#c62060"
                texto={`${String(data.salonesSinGuia.length)} salones sin guía`}
                detalle={data.salonesSinGuia
                  .slice(0, 3)
                  .map((s) => s.nombre)
                  .join(" — ")}
              />
            )}
            {porVencer > 0 && (
              <Aviso color="#b57a00" texto={`${String(porVencer)} contratos vencen en 30 días`} />
            )}
            {data.resumen !== null && data.resumen.reservasPendientes > 0 && (
              <Aviso
                color="#b57a00"
                texto={`${String(data.resumen.reservasPendientes)} reservas sin aprobar`}
              />
            )}
            {data.sesionesSinMarcar.length === 0 &&
              data.salonesSinGuia.length === 0 &&
              porVencer === 0 && (
                <p style={{ color: "var(--texto-suave)" }}>Todo al día. Nada pendiente.</p>
              )}
          </div>
        </section>
      </div>

      {/* ── Ocupación por salón ───────────────────────────────── */}
      {data.ocupacion.length > 0 && (
        <section style={tarjeta}>
          <h2 style={{ fontSize: "0.96rem", fontWeight: 800, marginBottom: "0.8rem" }}>
            Ocupación por salón
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {data.ocupacion.map((o) => {
              const pct = o.cupo > 0 ? Math.round((o.activas / o.cupo) * 100) : 0;
              const color =
                pct >= 70 ? "var(--lgs-verde)" : pct >= 35 ? "var(--lgs-amarillo)" : "var(--lgs-magenta)";
              return (
                <div
                  key={o.salon}
                  style={{ display: "grid", gridTemplateColumns: "10rem 1fr 3rem", gap: "0.6rem", alignItems: "center", fontSize: "0.82rem" }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.salon}
                  </span>
                  <span style={{ height: "0.5rem", borderRadius: "0.25rem", background: "#eef1f7", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${String(pct)}%`, background: color, borderRadius: "0.25rem" }} />
                  </span>
                  <span style={{ textAlign: "right", color: "var(--texto-suave)", fontVariantNumeric: "tabular-nums" }}>
                    {o.activas}/{o.cupo}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <style>{`
        @media (max-width: 900px) {
          .tablero-dos { grid-template-columns: 1fr !important; }
        }
        @keyframes lgsFlota { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        .lgs-float { animation: lgsFlota 5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .lgs-float { animation: none; } }
      `}</style>
    </div>
  );
}

const pastilla: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: "rgba(255,255,255,0.18)",
  border: "1px solid rgba(255,255,255,0.28)",
  padding: "0.25rem 0.65rem",
  borderRadius: "999px",
  fontSize: "0.76rem",
  fontWeight: 700,
};

function Aviso({ color, texto, detalle }: { color: string; texto: string; detalle?: string }) {
  return (
    <div
      style={{
        padding: "0.55rem 0.75rem",
        borderRadius: "0.6rem",
        background: "#fafbfe",
        borderLeft: `3px solid ${color}`,
        fontSize: "0.85rem",
      }}
    >
      <b>{texto}</b>
      {detalle !== undefined && (
        <div style={{ fontSize: "0.76rem", color: "var(--texto-suave)" }}>{detalle}</div>
      )}
    </div>
  );
}
