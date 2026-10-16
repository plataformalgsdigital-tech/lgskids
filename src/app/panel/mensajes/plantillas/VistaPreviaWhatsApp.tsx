"use client";

import type { ReactNode } from "react";

/**
 * VISTA PREVIA de una plantilla como la verá el apoderado en WhatsApp: los
 * marcadores rellenos con datos de EJEMPLO (los sirve la API) y el formato de
 * WhatsApp (*negrita*, _cursiva_, ~tachado~). Un marcador desconocido queda
 * vacío, igual que en el envío real.
 */

const RE_MARCADOR = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

/** *negrita*, _cursiva_ y ~tachado~ de WhatsApp, sin HTML crudo. */
function conFormato(linea: string): ReactNode[] {
  const partes = linea.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return partes.map((p, i) => {
    if (p.length > 2 && p.startsWith("*") && p.endsWith("*")) {
      return <strong key={i}>{p.slice(1, -1)}</strong>;
    }
    if (p.length > 2 && p.startsWith("_") && p.endsWith("_")) {
      return <em key={i}>{p.slice(1, -1)}</em>;
    }
    if (p.length > 2 && p.startsWith("~") && p.endsWith("~")) {
      return <s key={i}>{p.slice(1, -1)}</s>;
    }
    return <span key={i}>{p}</span>;
  });
}

export function VistaPreviaWhatsApp(props: {
  contenido: string;
  ejemplos: Record<string, string>;
}) {
  const texto = props.contenido.replace(RE_MARCADOR, (_, m: string) => props.ejemplos[m] ?? "");
  const hora = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  return (
    <div style={{ border: "1px solid #e3e7f0", borderRadius: "0.75rem", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.5rem",
          flexWrap: "wrap",
          padding: "0.5rem 0.8rem",
          fontSize: "0.8rem",
          background: "#f7f8fb",
          borderBottom: "1px solid #e3e7f0",
        }}
      >
        <strong>Vista previa del mensaje</strong>
        <span style={{ color: "var(--texto-suave)" }}>
          Con datos de ejemplo: {props.ejemplos["nombreCompleto"] ?? "—"}
        </span>
      </div>
      <div
        style={{ background: "#efeae2", padding: "0.9rem", maxHeight: "22rem", overflowY: "auto" }}
      >
        {texto.trim() === "" ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280" }}>
            Escribe el contenido para ver cómo queda.
          </p>
        ) : (
          <div
            style={{
              background: "#d9fdd3",
              color: "#111b21",
              borderRadius: "0.6rem 0 0.6rem 0.6rem",
              padding: "0.55rem 0.7rem 0.35rem",
              marginLeft: "auto",
              maxWidth: "92%",
              width: "fit-content",
              boxShadow: "0 1px 0.5px rgba(11,20,26,0.13)",
              fontSize: "0.9rem",
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {texto.split("\n").map((linea, i, todas) => (
              <span key={i}>
                {conFormato(linea)}
                {i < todas.length - 1 && "\n"}
              </span>
            ))}
            <div style={{ textAlign: "right", fontSize: "0.68rem", color: "#667781" }}>
              {hora} ✓✓
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
