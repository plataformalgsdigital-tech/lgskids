import type { CSSProperties } from "react";

/** Los estados de una reserva de Welcome, como los nombra Servicio (y MOSAICO). */
export type EstadoWelcome = "ASISTIO" | "ASISTIO_OTRA" | "VIDEO" | "PENDIENTE" | "NO_ASISTIO";

export const ESTADO_WELCOME: Record<
  EstadoWelcome,
  { texto: string; color: string; fondo: string }
> = {
  ASISTIO: { texto: "Asistió", color: "#1b5e20", fondo: "#e8f5e9" },
  ASISTIO_OTRA: { texto: "Asistió a otra sesión", color: "#2e7d32", fondo: "#f1f8e9" },
  VIDEO: { texto: "Recibió el video", color: "#4527a0", fondo: "#ede7f6" },
  PENDIENTE: { texto: "Pendiente", color: "#37474f", fondo: "#eceff1" },
  NO_ASISTIO: { texto: "No asistió", color: "#b71c1c", fondo: "#ffebee" },
};

export function pastillaWelcome(e: EstadoWelcome): CSSProperties {
  return {
    display: "inline-block",
    padding: "0.1rem 0.5rem",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "0.76rem",
    color: ESTADO_WELCOME[e].color,
    background: ESTADO_WELCOME[e].fondo,
    whiteSpace: "nowrap",
  };
}

/** Fecha y hora de un instante, en el reloj de quien mira. */
export function cuandoWelcome(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString("es", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    hora: d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
  };
}

export const MOTIVO_PENDIENTE: Record<string, { texto: string; color: string; fondo: string }> = {
  SOLO_PERFIL: { texto: "Enlace de sólo perfil", color: "#4527a0", fondo: "#ede7f6" },
  SIN_PERFIL: { texto: "No ha creado su perfil", color: "#b57a00", fondo: "#fff8e1" },
  // Creó su perfil sin Welcome porque no había cupo: hay que agendárselo.
  SIN_DISPONIBILIDAD: {
    texto: "Sin Welcome disponible: consultar a Servicio",
    color: "#c62828",
    fondo: "#ffebee",
  },
  SIN_REGISTRO: { texto: "Sin registro de motivo", color: "#37474f", fondo: "#eceff1" },
};
