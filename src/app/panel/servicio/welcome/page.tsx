"use client";

import { useState } from "react";
import { usePermisos } from "@/ui/permisos";
import { botonServicio } from "../FiltrosServicio";
import { EventosTab } from "./EventosTab";
import { PendientesTab } from "./PendientesTab";
import { ReagendamientosTab } from "./ReagendamientosTab";
import { VideoTab } from "./VideoTab";

/**
 * Servicio › Welcome: el mismo proceso de MOSAICO (Servicio › Welcome Session),
 * ajustado a KIDS. Cuatro pestañas: los agendados y su asistencia, los que
 * faltaron y hay que reagendar, los que no tienen Welcome, y el video para
 * quien faltó a los 2. Las reglas viven en el servidor
 * (`scheduling/application/servicio-welcome.ts`).
 */

const PESTANAS = [
  { valor: "eventos", texto: "Eventos Welcome", op: "op.servicio.welcome_eventos" },
  {
    valor: "reagendamientos",
    texto: "Gestión de Reagendamientos",
    op: "op.servicio.welcome_reagendamientos",
  },
  { valor: "pendientes", texto: "Pendientes de agendar", op: "op.servicio.welcome_pendientes" },
  { valor: "video", texto: "Video Welcome", op: "op.servicio.welcome_video" },
] as const;

export default function ServicioWelcomePage() {
  const [elegida, setPestana] = useState<(typeof PESTANAS)[number]["valor"]>("eventos");
  // Cada pestaña con su opción (Roles › Servicio › Welcome).
  const { puede, listo } = usePermisos();
  const permitidas = PESTANAS.filter((p) => puede(p.op));
  const pestana = permitidas.some((p) => p.valor === elegida) ? elegida : permitidas[0]?.valor;
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <main style={{ padding: "2rem", maxWidth: "88rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Welcome</h1>
      <p style={{ color: "var(--texto-suave)", fontSize: "0.9rem", marginTop: "0.3rem" }}>
        La sesión de bienvenida de cada niño: quién asistió, a quién hay que reagendar (hasta 2
        Welcome por niño), quién no tiene Welcome y a quién mandarle el video. Fecha y hora en tu
        reloj ({zona}).
      </p>
      <div
        role="tablist"
        style={{ display: "flex", gap: "0.3rem", margin: "1rem 0 0", flexWrap: "wrap" }}
      >
        {permitidas.map((p) => (
          <button
            key={p.valor}
            type="button"
            role="tab"
            aria-selected={pestana === p.valor}
            onClick={() => setPestana(p.valor)}
            style={{
              ...botonServicio,
              padding: "0.45rem 0.9rem",
              background: pestana === p.valor ? "var(--lgs-azul)" : "white",
              color: pestana === p.valor ? "white" : "inherit",
              borderColor: pestana === p.valor ? "var(--lgs-azul)" : "#e3e7f0",
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>
      {listo && pestana === undefined && (
        <p style={{ marginTop: "1rem", color: "var(--texto-suave)" }}>
          🔒 Tu rol no tiene habilitada ninguna pestaña de Welcome.
        </p>
      )}
      {pestana === "eventos" && <EventosTab zona={zona} />}
      {pestana === "reagendamientos" && <ReagendamientosTab zona={zona} />}
      {pestana === "pendientes" && <PendientesTab />}
      {pestana === "video" && <VideoTab />}
    </main>
  );
}
