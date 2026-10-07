"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

interface Vista {
  destinatario: {
    apoderado: string | null;
    telefonoDe: "apoderado" | "niño" | null;
    telefono: string | null;
    whatsapp: string | null;
    usuario: string | null;
    vistaPrevia: string | null;
  };
  problema: string | null;
  proveedor: string;
}

const btn: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #d8dce6",
  background: "white",
  fontWeight: 600,
  cursor: "pointer",
};

/**
 * Usuario y clave del niño al WhatsApp de su apoderado. Primero se ve A QUIÉN
 * y QUÉ —con la clave tapada: quien envía no la ve— y se confirma. La clave
 * sale de la bóveda directo al mensaje, en el servidor.
 */
export function EnviarCredencialesModal({
  childPersonId,
  nombre,
  onCerrar,
}: {
  childPersonId: string;
  nombre: string;
  onCerrar: () => void;
}) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(`/api/notifications/credenciales/${childPersonId}`);
      const data: Vista & { error?: { message: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo preparar el mensaje.");
        return;
      }
      setVista(data);
    }
    void cargar();
  }, [childPersonId]);

  async function enviar() {
    setError(null);
    setOcupado(true);
    try {
      const res = await apiFetch(`/api/notifications/credenciales/${childPersonId}`, {
        method: "POST",
      });
      const data: {
        ok?: boolean;
        destinatario?: string;
        error?: string | { message: string };
      } = await res.json();
      if (res.ok && data.ok === true) {
        setEnviado(data.destinatario ?? "");
        return;
      }
      setError(
        typeof data.error === "string"
          ? `WhatsApp no lo aceptó: ${data.error}`
          : (data.error?.message ?? "No se pudo enviar."),
      );
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  const d = vista?.destinatario;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enviar credenciales por WhatsApp"
      onClick={onCerrar}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "1rem",
          padding: "1.4rem",
          width: "min(34rem, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.8rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>📲 Enviar usuario y clave por WhatsApp</h2>
        <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--texto-suave)" }}>{nombre}</p>

        {vista === null && error === null && (
          <p style={{ color: "var(--texto-suave)" }}>Preparando el mensaje…</p>
        )}

        {d !== undefined && enviado === null && (
          <>
            <div style={{ fontSize: "0.9rem" }}>
              <div>
                Para: <strong>{d.apoderado ?? "—"}</strong>
              </div>
              <div>
                WhatsApp:{" "}
                {d.whatsapp !== null ? (
                  <strong>+{d.whatsapp}</strong>
                ) : (
                  <span style={{ color: "#c62828" }}>{d.telefono ?? "sin teléfono"}</span>
                )}
                {d.telefonoDe === "niño" && (
                  <span style={{ color: "#7a5200" }}>
                    {" "}
                    (es el teléfono del registro del niño: no hay apoderado con teléfono)
                  </span>
                )}
              </div>
            </div>
            {d.vistaPrevia !== null && (
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  background: "#e7f6e0",
                  borderRadius: "0.8rem",
                  padding: "0.8rem 1rem",
                  fontSize: "0.88rem",
                }}
              >
                {d.vistaPrevia}
              </div>
            )}
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--texto-suave)" }}>
              La clave va tapada aquí: se pone en el mensaje al enviarlo y no queda guardada en el
              historial.
            </p>
            {vista?.proveedor === "SIMULADO" && (
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#7a5200" }}>
                ⚠ Modo simulado: este servidor no tiene el token de WhatsApp; el mensaje no llegará.
              </p>
            )}
            {vista?.problema != null && (
              <p role="alert" style={{ margin: 0, color: "#c62828", fontSize: "0.88rem" }}>
                {vista.problema}
              </p>
            )}
          </>
        )}

        {enviado !== null && (
          <p
            style={{
              margin: 0,
              background: "#e8f5e9",
              color: "#1b5e20",
              padding: "0.7rem 1rem",
              borderRadius: "0.6rem",
            }}
          >
            ✔ Enviado al WhatsApp +{enviado}. Queda en Administración › Mensajes › Historial.
          </p>
        )}

        {error !== null && (
          <p role="alert" style={{ margin: 0, color: "#c62828", fontSize: "0.88rem" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" style={btn} onClick={onCerrar}>
            {enviado !== null ? "Cerrar" : "Cancelar"}
          </button>
          {enviado === null && vista !== null && vista.problema === null && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void enviar()}
              style={{
                ...btn,
                border: "none",
                background: "#25d366",
                color: "white",
                opacity: ocupado ? 0.6 : 1,
              }}
            >
              {ocupado ? "Enviando…" : "Enviar por WhatsApp"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
