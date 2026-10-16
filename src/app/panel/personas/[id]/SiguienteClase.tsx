"use client";

import { useState, type CSSProperties } from "react";
import { referenciaHoraria } from "@/ui/hora-paises";

export interface SiguienteClaseDato {
  startsAt: string;
  tipo: string;
  duracionMin: number;
  timezone: string;
  guia: string | null;
  meetingUrl: string | null;
}

const TIPO: Record<string, string> = { SESION: "Sesión", CLUB: "Club", TALLER: "Taller" };

/** "martes, 20 de octubre" en la zona DEL SALÓN (la fecha es la de su reloj). */
function fechaLarga(instante: string, zona: string): string {
  return new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: zona,
  }).format(new Date(instante));
}

/** Copia al portapapeles; sin permiso del navegador, por el camino viejo. */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

const boton: CSSProperties = {
  border: "1px solid #c5cae9",
  background: "#fff",
  borderRadius: "0.5rem",
  padding: "0.3rem 0.6rem",
  fontSize: "0.8rem",
  fontWeight: 700,
  cursor: "pointer",
};

/**
 * La siguiente clase del niño en el encabezado de su ficha, con el enlace a la
 * vista y listo para copiar: es lo que se le dicta o se le pega a la familia
 * cuando pregunta "¿cuándo es y por dónde entro?". Hora de Chile Y de
 * Colombia/Ecuador/Perú, porque quien atiende puede estar en cualquiera.
 */
export function SiguienteClase(props: { clase: SiguienteClaseDato | null }) {
  const [copiado, setCopiado] = useState<"enlace" | "todo" | "error" | null>(null);
  const c = props.clase;

  const caja: CSSProperties = {
    border: "1px solid #c5cae9",
    background: "#f5f7ff",
    borderRadius: "0.8rem",
    padding: "0.7rem 0.9rem",
    minWidth: "17rem",
    maxWidth: "26rem",
  };

  if (c === null) {
    return (
      <div style={caja}>
        <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#3949ab" }}>
          📅 SIGUIENTE CLASE
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--texto-suave)", marginTop: "0.2rem" }}>
          Sin clases por delante.
        </div>
      </div>
    );
  }

  const hora = referenciaHoraria(c.startsAt);
  const fecha = fechaLarga(c.startsAt, c.timezone);
  const tipo = TIPO[c.tipo] ?? c.tipo;
  const enlace = c.meetingUrl;
  const invitacion = [
    `${tipo} del ${fecha}`,
    `Hora: ${hora.chile} Chile · ${hora.colombia} Colombia/Ecuador/Perú`,
    ...(c.guia !== null ? [`Guía: ${c.guia}`] : []),
    `Enlace: ${enlace ?? "sin enlace configurado"}`,
  ].join("\n");

  async function alCopiar(que: "enlace" | "todo") {
    const ok = await copiar(que === "enlace" ? (enlace ?? "") : invitacion);
    setCopiado(ok ? que : "error");
    window.setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <div style={caja}>
      <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#3949ab" }}>
        📅 SIGUIENTE CLASE
      </div>
      <div style={{ fontWeight: 700, marginTop: "0.2rem", textTransform: "capitalize" }}>
        {tipo} · {fecha}
      </div>
      <div style={{ fontSize: "0.85rem" }}>
        <strong>{hora.chile} Chile</strong> · {hora.colombia} Colombia/Ecuador/Perú
      </div>
      {c.guia !== null && (
        <div style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>con {c.guia}</div>
      )}
      <div
        style={{
          marginTop: "0.45rem",
          fontSize: "0.8rem",
          wordBreak: "break-all",
          color: enlace === null ? "var(--texto-suave)" : undefined,
        }}
      >
        🔗{" "}
        {enlace !== null ? (
          <a href={enlace} target="_blank" rel="noreferrer">
            {enlace}
          </a>
        ) : (
          "Sin enlace: el guía no tiene sala de Zoom en su ficha."
        )}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        {enlace !== null && (
          <button type="button" style={boton} onClick={() => void alCopiar("enlace")}>
            {copiado === "enlace" ? "✓ Enlace copiado" : "📋 Copiar enlace"}
          </button>
        )}
        <button type="button" style={boton} onClick={() => void alCopiar("todo")}>
          {copiado === "todo" ? "✓ Copiado" : "📋 Copiar con fecha y hora"}
        </button>
        {copiado === "error" && (
          <span style={{ fontSize: "0.8rem", color: "#c62828" }}>No se pudo copiar.</span>
        )}
      </div>
    </div>
  );
}
