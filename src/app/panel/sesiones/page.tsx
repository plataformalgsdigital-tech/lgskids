"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { usePermisos } from "@/ui/permisos";

/**
 * Índice de Sesiones (mismo patrón que Mantenimiento Académico).
 *
 * El menú lateral de KIDS es de dos niveles, así que lo que en MOSAICO es un
 * submenú aquí es una página con tarjetas. Deja sitio para traer Suspensiones
 * y Feriados, que hoy viven dentro del calendario.
 */

interface Tarjeta {
  titulo: string;
  desc: string;
  emoji: string;
  color: string;
  href?: string;
  /** Su opción en Roles: sin ella, la tarjeta no aparece. */
  op: string;
}

const TARJETAS: Tarjeta[] = [
  {
    titulo: "Refuerzos",
    desc: "Solicitudes de repetir una sesión marcadas por los guías, pendientes de autorización.",
    emoji: "🔁",
    color: "var(--lgs-azul)",
    href: "/panel/sesiones/refuerzos",
    op: "op.sesiones.refuerzos",
  },
  {
    titulo: "Cancelaciones",
    desc: "Avisos de los guías que no pueden dictar una sesión: cancelarla (cuenta en sus horas), cubrirla con otro guía solo esa vez, o rechazar.",
    emoji: "📣",
    color: "#6a1b9a",
    href: "/panel/sesiones/cancelaciones",
    op: "op.sesiones.cancelaciones",
  },
  {
    titulo: "Eventos administrativos",
    desc: "Reuniones, capacitaciones y talleres internos. La audiencia son guías, no niños.",
    emoji: "📋",
    color: "var(--lgs-purpura)",
    href: "/panel/sesiones/eventos-administrativos",
    op: "op.sesiones.eventos_admin",
  },
  {
    titulo: "Links de Clubes",
    desc: "Salas de Zoom propias de los Clubs (nombre, día, horario y link), distintas de la del advisor.",
    emoji: "🔗",
    color: "#2e7d32",
    href: "/panel/sesiones/links-clubes",
    op: "op.sesiones.links_clubes",
  },
  {
    titulo: "Suspensiones",
    desc: "Suspender una sesión con motivo y regenerar el salón. Hoy se hace desde el calendario.",
    emoji: "⛔",
    color: "var(--lgs-magenta)",
    href: "/panel/sesiones/suspensiones",
    op: "op.sesiones.suspensiones",
  },
  {
    titulo: "Feriados",
    desc: "Calendario de feriados por país y los extra curados que solo suman.",
    emoji: "📅",
    color: "var(--lgs-amarillo)",
    href: "/panel/sesiones/feriados",
    op: "op.sesiones.feriados",
  },
];

const cardBase: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
  padding: "1.5rem",
  border: "2px solid #e3e7f0",
  borderRadius: "1rem",
  background: "white",
  color: "inherit",
  minHeight: "9.5rem",
};

export default function SesionesPage() {
  const { puede } = usePermisos();
  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Sesiones</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        Lo que se opera sobre las sesiones fuera del calendario del día a día.
      </p>

      <div
        style={{
          marginTop: "1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
          gap: "1rem",
        }}
      >
        {TARJETAS.filter((t) => puede(t.op)).map((t) => {
          const contenido = (
            <>
              <span
                aria-hidden
                style={{
                  width: "3rem",
                  height: "3rem",
                  borderRadius: "0.8rem",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.5rem",
                  background: "#f4f6fb",
                  borderLeft: `4px solid ${t.color}`,
                }}
              >
                {t.emoji}
              </span>
              <strong style={{ fontSize: "1.05rem" }}>
                {t.titulo}
                {t.href === undefined && (
                  <span
                    style={{ fontSize: "0.68rem", color: "var(--texto-suave)", fontWeight: 600 }}
                  >
                    {" "}
                    (pronto)
                  </span>
                )}
              </strong>
              <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>{t.desc}</span>
            </>
          );
          return t.href !== undefined ? (
            <Link key={t.titulo} href={t.href} style={cardBase}>
              {contenido}
            </Link>
          ) : (
            <div key={t.titulo} style={{ ...cardBase, opacity: 0.55 }}>
              {contenido}
            </div>
          );
        })}
      </div>
    </main>
  );
}
