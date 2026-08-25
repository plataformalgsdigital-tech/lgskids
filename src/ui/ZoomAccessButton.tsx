"use client";

import type { CSSProperties } from "react";
import { mensajeZoom, type EstadoZoom } from "./zoom-window";

/** Cámara estilo Zoom (cuadros azules) + badge verde con check → habilitado. */
function IconoActivo() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <defs>
        <clipPath id="z-round">
          <rect x="2" y="2" width="52" height="52" rx="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#z-round)">
        <rect x="2" y="2" width="26" height="26" fill="#1e3a8a" />
        <rect x="28" y="2" width="26" height="26" fill="#2f6bf0" />
        <rect x="2" y="28" width="26" height="26" fill="#2450c8" />
        <rect x="28" y="28" width="26" height="26" fill="#4d8bff" />
      </g>
      {/* cuerpo de cámara */}
      <rect x="14" y="21" width="18" height="14" rx="3" fill="white" />
      <path d="M34 25 L42 20 V36 L34 31 Z" fill="white" />
      {/* badge check verde */}
      <circle cx="42" cy="15" r="11" fill="white" />
      <circle cx="42" cy="15" r="9" fill="#22c55e" />
      <path
        d="M38 15.5 L41 18.5 L46.5 12"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Cámara gris apagada + badge reloj naranja → bloqueado (espera/vencido/cerrado). */
function IconoEspera() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <defs>
        <clipPath id="z-round-g">
          <rect x="2" y="2" width="52" height="52" rx="12" />
        </clipPath>
      </defs>
      <g clipPath="url(#z-round-g)">
        <rect x="2" y="2" width="26" height="26" fill="#334155" />
        <rect x="28" y="2" width="26" height="26" fill="#475569" />
        <rect x="2" y="28" width="26" height="26" fill="#475569" />
        <rect x="28" y="28" width="26" height="26" fill="#7c899c" />
      </g>
      <rect x="14" y="21" width="18" height="14" rx="3" fill="#eceff3" />
      <path d="M34 25 L42 20 V36 L34 31 Z" fill="#eceff3" />
      {/* badge reloj naranja */}
      <circle cx="42" cy="15" r="11" fill="white" />
      <circle cx="42" cy="15" r="9" fill="#e8730f" />
      <path
        d="M42 10.5 V15 L45 17"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const COLOR_TEXTO: Record<EstadoZoom, string> = {
  espera: "var(--lgs-azul-oscuro)",
  disponible: "#1b5e20",
  vencido: "#c62828",
  cerrado: "var(--texto-suave)",
};

/**
 * Botón de acceso a Zoom del alumno. Si `disponible`, es un enlace clicable
 * (cámara azul + check verde) que registra el ingreso; en cualquier otro estado
 * es un ícono bloqueado (cámara gris + reloj) con el motivo.
 */
export function ZoomAccessButton(props: {
  meetingUrl: string | null;
  estado: EstadoZoom;
  tieneAcceso: boolean;
  onEntrar: () => void;
  textoClaro?: boolean; // sobre fondo oscuro (banner azul)
}) {
  const { meetingUrl, estado, tieneAcceso, onEntrar, textoClaro } = props;
  const disponible = estado === "disponible" && meetingUrl !== null;
  const wrap: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  };
  const texto: CSSProperties = {
    fontSize: "0.8rem",
    fontWeight: 600,
    maxWidth: "16rem",
    color: textoClaro ? "white" : COLOR_TEXTO[estado],
    opacity: textoClaro ? 0.95 : 1,
  };

  if (disponible) {
    return (
      <div style={wrap}>
        <a href={meetingUrl} target="_blank" rel="noreferrer" onClick={onEntrar} title="Entrar a la clase">
          <IconoActivo />
        </a>
        <span style={texto}>🎥 {mensajeZoom(estado, tieneAcceso)}</span>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <span style={{ opacity: 0.9, cursor: "not-allowed" }} title={mensajeZoom(estado, tieneAcceso)}>
        <IconoEspera />
      </span>
      <span style={texto}>{mensajeZoom(estado, tieneAcceso)}</span>
    </div>
  );
}
