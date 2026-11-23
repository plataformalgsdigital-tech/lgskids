"use client";

import { useEffect, useState } from "react";
import { EVENTO_FALLA_ENVIO } from "./api-fetch";

/**
 * Modal con la CAUSA cuando un mensaje de WhatsApp no salió. Lo abre `apiFetch` al ver
 * la cabecera de falla de envío del servidor, así que sirve a TODAS las pantallas que
 * envían (ficha del niño, enlaces de perfil, mensajes masivos, faltas…) sin que cada
 * una lo repita. Va una sola vez en el layout del panel.
 */
export function FallaWhatsApp() {
  const [causa, setCausa] = useState<string | null>(null);

  useEffect(() => {
    const alFallar = (e: Event) => {
      const detalle = (e as CustomEvent<{ causa?: string }>).detail;
      setCausa(detalle.causa ?? "No se pudo enviar el mensaje.");
    };
    window.addEventListener(EVENTO_FALLA_ENVIO, alFallar);
    return () => window.removeEventListener(EVENTO_FALLA_ENVIO, alFallar);
  }, []);

  if (causa === null) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="falla-whatsapp-titulo"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 24, 40, 0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "0.9rem",
          padding: "1.4rem",
          maxWidth: "30rem",
          width: "100%",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        <h2 id="falla-whatsapp-titulo" style={{ margin: 0, fontSize: "1.1rem", color: "#c62828" }}>
          📵 El mensaje no se pudo enviar
        </h2>
        <p style={{ margin: "0.8rem 0 0", lineHeight: 1.45 }}>{causa}</p>
        <div style={{ marginTop: "1.1rem", textAlign: "right" }}>
          <button
            type="button"
            autoFocus
            onClick={() => setCausa(null)}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "0.6rem",
              border: "none",
              background: "var(--lgs-azul)",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
