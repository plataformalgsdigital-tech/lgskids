"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Administración › Mantenimiento: las cargas masivas. Cada una VALIDA el
 * archivo contra la base y pide confirmación antes de escribir.
 */
const TARJETAS = [
  {
    titulo: "Carga catálogo Curso (CSV)",
    desc: "Temario, video, materiales, actividades, recursos y clubes de cada lección. Valida el archivo, muestra qué se crea y qué se actualiza, y pide confirmación.",
    emoji: "📥",
    color: "var(--lgs-cian)",
    href: "/panel/mantenimiento/catalogo-curso",
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

export default function MantenimientoPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Mantenimiento</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        Cargas masivas de datos. Nada se escribe hasta que confirmes, y cada carga queda en la
        auditoría.
      </p>

      <div
        style={{
          marginTop: "1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
          gap: "1rem",
        }}
      >
        {TARJETAS.map((t) => (
          <Link key={t.titulo} href={t.href} style={cardBase}>
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
            <strong style={{ fontSize: "1.05rem" }}>{t.titulo}</strong>
            <span style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>{t.desc}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
