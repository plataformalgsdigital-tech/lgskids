"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Aviso de la pantalla de login: subir/cambiar la imagen y prenderla o
 * apagarla. Equivale al banner que ya opera en MOSAICO2026 y LGS2026.
 *
 * La imagen se guarda como arte (tipo `aviso_login`) por el módulo `files`;
 * el interruptor vive en `platform_config`. Apagarlo también deja de exponer
 * la imagen en la ruta pública, no solo de mostrarla.
 */

type Estado = { activo: boolean; url: string | null; actualizadoEn: string | null };

export default function AvisoLoginPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await apiFetch("/api/catalog/aviso-login");
      if (!res.ok) {
        setError("No se pudo leer el estado del aviso.");
        return;
      }
      setEstado((await res.json()) as Estado);
      setError(null);
    } catch {
      setError("Error de conexión.");
    }
  }, []);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  async function cambiarActivo(activo: boolean) {
    if (activo && estado?.url === null) {
      setError("Sube una imagen antes de prender el aviso.");
      return;
    }
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const res = await apiFetch("/api/catalog/aviso-login", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo }),
      });
      if (!res.ok) {
        setError("No se pudo cambiar el estado.");
        return;
      }
      setAviso(activo ? "Aviso prendido: ya se ve en el login." : "Aviso apagado.");
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function subir(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    event.target.value = "";
    if (archivo === undefined) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const form = new FormData();
      form.append("tipo", "aviso_login");
      form.append("archivo", archivo);
      const res = await apiFetch("/api/catalog/imagen-curso", { method: "POST", body: form });
      if (!res.ok) {
        const cuerpo: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setError(cuerpo.error?.message ?? "No se pudo subir la imagen.");
        return;
      }
      setAviso("Imagen actualizada. Es la que verán en el login.");
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  const encendido = estado?.activo === true;

  return (
    <div style={{ maxWidth: "44rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.35rem" }}>
        📣 Aviso de la pantalla de login
      </h1>
      <p style={{ color: "var(--texto-suave)", marginBottom: "1.5rem" }}>
        La imagen se muestra sobre el login la primera vez que alguien entra. Si la cierra, no
        vuelve a aparecer hasta que abra el navegador de nuevo.
      </p>

      {error !== null && (
        <p role="alert" style={{ color: "#c62828", marginBottom: "1rem", fontWeight: 600 }}>
          {error}
        </p>
      )}
      {aviso !== null && (
        <p style={{ color: "#1b5e20", marginBottom: "1rem", fontWeight: 600 }}>{aviso}</p>
      )}

      <section
        style={{
          border: "1px solid #e3e7f0",
          borderRadius: "0.9rem",
          padding: "1.25rem",
          marginBottom: "1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ fontWeight: 700 }}>
            Estado:{" "}
            <span style={{ color: encendido ? "#1b5e20" : "var(--texto-suave)" }}>
              {encendido ? "prendido" : "apagado"}
            </span>
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)" }}>
            {encendido
              ? "Todo el que abra /login lo va a ver."
              : "Nadie lo ve, y la imagen tampoco queda expuesta."}
          </p>
        </div>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void cambiarActivo(!encendido)}
          style={{
            padding: "0.6rem 1.2rem",
            borderRadius: "0.6rem",
            border: "none",
            background: encendido ? "#c62828" : "var(--lgs-verde)",
            color: "white",
            fontWeight: 700,
            cursor: ocupado ? "wait" : "pointer",
          }}
        >
          {encendido ? "Apagar aviso" : "Prender aviso"}
        </button>
      </section>

      <section style={{ border: "1px solid #e3e7f0", borderRadius: "0.9rem", padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Imagen</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--texto-suave)", marginBottom: "0.9rem" }}>
          JPG, PNG o WebP, hasta 10 MB. Se muestra completa: usa una imagen ya diseñada al tamaño
          que quieras (se recomienda vertical u horizontal cerrada, no muy alargada).
        </p>

        <label
          style={{
            display: "inline-block",
            padding: "0.6rem 1.1rem",
            borderRadius: "0.6rem",
            border: "1.5px solid var(--lgs-azul)",
            color: "var(--lgs-azul)",
            fontWeight: 700,
            cursor: ocupado ? "wait" : "pointer",
            marginBottom: "1rem",
          }}
        >
          {estado?.url !== null && estado?.url !== undefined ? "Cambiar imagen" : "Subir imagen"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={ocupado}
            onChange={(e) => void subir(e)}
            style={{ display: "none" }}
          />
        </label>

        {estado?.url !== null && estado?.url !== undefined ? (
          <div>
            <p style={{ fontSize: "0.8rem", color: "var(--texto-suave)", marginBottom: "0.4rem" }}>
              Así se ve hoy:
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={estado.url}
              alt="Aviso de login"
              style={{
                display: "block",
                maxWidth: "22rem",
                width: "100%",
                height: "auto",
                borderRadius: "0.7rem",
                border: "1px solid #e3e7f0",
              }}
            />
          </div>
        ) : (
          <p style={{ color: "var(--texto-suave)" }}>Todavía no hay imagen cargada.</p>
        )}
      </section>
    </div>
  );
}
