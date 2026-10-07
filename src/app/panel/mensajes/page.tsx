"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Administración › Mensajes: WhatsApp a los apoderados con el MISMO servicio
 * de LGS (Whapi). Como en LGS, Gestión envía y Plantillas define los textos.
 */
const TARJETAS = [
  {
    titulo: "Gestión de mensajes",
    desc: "Envía una plantilla al WhatsApp de los apoderados de un salón o de una lista de documentos, y revisa el historial de lo enviado.",
    emoji: "📲",
    color: "var(--lgs-verde)",
    href: "/panel/mensajes/gestion",
  },
  {
    titulo: "Plantillas",
    desc: "Los textos de los mensajes, con marcadores como {{nombre}} o {{usuario}} que se rellenan con los datos de cada niño.",
    emoji: "📝",
    color: "var(--lgs-azul)",
    href: "/panel/mensajes/plantillas",
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

export default function MensajesPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "64rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Mensajes</h1>
      <p style={{ color: "var(--texto-suave)", marginTop: "0.25rem" }}>
        WhatsApp a los apoderados, por el mismo servicio que usa LGS.
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
