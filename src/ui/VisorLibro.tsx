"use client";

import { useEffect, useRef, useState } from "react";
import { Personaje } from "@/ui/Personaje";

/** La caja del libro tal como la manda el servidor (no se copia aquí). */
export interface CajaLibro {
  sandbox: string;
  prefijo: string;
  mensaje: string;
}

/**
 * El libro interactivo corre aislado (origen opaco) y no tiene `localStorage`
 * propio: el puente que el servidor le inyecta manda aquí cada cambio de su
 * progreso, y este visor lo guarda en el del panel, con la clave que le pasen
 * (por niño y nivel). Tope: el almacenamiento del navegador ronda 5 MB por
 * sitio y lo comparte todo el panel.
 */
const TOPE_PROGRESO = 2_000_000;

/** Solo pares texto→texto: es lo único que un `localStorage` puede contener. */
function soloTextos(o: unknown): Record<string, string> {
  if (typeof o !== "object" || o === null) return {};
  return Object.fromEntries(
    Object.entries(o as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
}

function leerProgreso(clave: string): Record<string, string> {
  try {
    return soloTextos(JSON.parse(window.localStorage.getItem(clave) ?? "{}"));
  } catch {
    return {}; // sin almacenamiento (modo privado, cuota): el libro empieza de cero
  }
}

/**
 * Libro interactivo a pantalla completa. Lo usan el panel del niño y la vista
 * previa del equipo, para que el equipo vea EXACTAMENTE lo que ve el niño.
 *
 * El iframe lleva la MISMA caja que la CSP del servidor (`sandbox` sin
 * allow-same-origin). Por su `name` el libro recibe, antes de que corra su
 * script, `{v:2, datos, videos}`: su progreso guardado y la base con token de
 * sus videos (`videos/7-1.mp4` sale de ahí). Lo nuevo vuelve por postMessage.
 */
export function VisorLibro({
  url,
  titulo,
  caja,
  claveProgreso,
  videosBase,
  onCerrar,
}: {
  url: string;
  titulo: string;
  caja: CajaLibro;
  claveProgreso: string;
  videosBase: string | null;
  onCerrar: () => void;
}) {
  // Se calcula UNA vez al abrir: cambiarlo después no llega al documento ya cargado.
  const [nombre] = useState(
    () =>
      caja.prefijo +
      JSON.stringify({ v: 2, datos: leerProgreso(claveProgreso), videos: videosBase }),
  );
  const [cargado, setCargado] = useState(false);
  const marco = useRef<HTMLIFrameElement | null>(null);

  // Solo se acepta lo que viene de ESTE iframe —el origen es "null" por la
  // caja, así que se compara la ventana, no el origen— y con forma de storage.
  useEffect(() => {
    function onMensaje(e: MessageEvent) {
      if (e.source === null || e.source !== marco.current?.contentWindow) return;
      const m = e.data as { tipo?: unknown; datos?: unknown } | null;
      if (m?.tipo !== caja.mensaje) return;
      const texto = JSON.stringify(soloTextos(m.datos));
      if (texto.length > TOPE_PROGRESO) return;
      try {
        window.localStorage.setItem(claveProgreso, texto);
      } catch {
        // Sin almacenamiento: el libro sigue funcionando durante la sesión.
      }
    }
    window.addEventListener("message", onMensaje);
    return () => window.removeEventListener("message", onMensaje);
  }, [claveProgreso, caja.mensaje]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Libro interactivo"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "#0a0e1e",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.55rem 0.9rem",
          background: "linear-gradient(120deg, var(--lgs-azul) 0%, var(--lgs-purpura) 140%)",
          color: "white",
        }}
      >
        <strong style={{ fontSize: "1rem" }}>📖 {titulo}</strong>
        <button
          type="button"
          onClick={onCerrar}
          style={{
            border: "none",
            borderRadius: "999px",
            padding: "0.45rem 1rem",
            background: "white",
            color: "var(--lgs-azul)",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          ✕ Cerrar libro
        </button>
      </div>
      <div style={{ position: "relative", flex: 1 }}>
        {!cargado && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "white",
              textAlign: "center",
              padding: "1rem",
            }}
          >
            <div>
              <Personaje quien="coco" alto="7rem" className="lgs-float" />
              <p style={{ marginTop: "0.75rem", fontWeight: 700 }}>Abriendo el libro…</p>
            </div>
          </div>
        )}
        <iframe
          ref={marco}
          src={url}
          name={nombre}
          sandbox={caja.sandbox}
          allow="fullscreen"
          title="Libro interactivo"
          onLoad={() => setCargado(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
            background: "white",
            opacity: cargado ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}
