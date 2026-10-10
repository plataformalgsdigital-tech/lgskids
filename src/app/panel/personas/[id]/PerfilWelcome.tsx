"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * "Perfil y Welcome" en la ficha del niño: si ya creó su perfil desde el enlace
 * que recibió su apoderado, qué contó de sí, y el Welcome que agendó. Con
 * `mensajes.enviar` se REENVÍA el enlace (emite uno nuevo y revoca el anterior),
 * por ejemplo cuando el WhatsApp falló o el apoderado lo perdió.
 */

interface EstadoPerfil {
  perfilCompletadoEn: string | null;
  sobreTi: string | null;
  hobbies: string | null;
  enlace: { estado: "VIGENTE" | "USADO" | "REVOCADO"; creadoEn: string } | null;
  welcome: {
    startsAt: string;
    duracionMin: number;
    guia: string;
    asistio: boolean | null;
  } | null;
}

const card: CSSProperties = {
  border: "1px solid #e3e7f0",
  borderRadius: "0.9rem",
  padding: "1.25rem",
};

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PerfilWelcome({
  childPersonId,
  tieneCuenta,
  puedeEnviar,
}: {
  childPersonId: string;
  tieneCuenta: boolean;
  puedeEnviar: boolean;
}) {
  const [estado, setEstado] = useState<EstadoPerfil | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const res = await apiFetch(`/api/contracts/ninos/${childPersonId}/perfil`);
    if (res.ok) setEstado((await res.json()) as EstadoPerfil);
  }, [childPersonId]);

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  async function reenviar() {
    if (
      !window.confirm(
        "Se enviará al WhatsApp del apoderado un enlace NUEVO para crear el perfil. El anterior deja de servir. ¿Enviar?",
      )
    ) {
      return;
    }
    setOcupado(true);
    setAviso(null);
    try {
      const res = await apiFetch(`/api/contracts/ninos/${childPersonId}/perfil`, {
        method: "POST",
      });
      const c = (await res.json().catch(() => ({}))) as {
        enviado?: boolean;
        destinatario?: string | null;
        error?: string | { message?: string };
      };
      if (res.ok && c.enviado === true) {
        setAviso({ ok: true, texto: `Enlace enviado a +${c.destinatario ?? ""}.` });
      } else {
        const msg = typeof c.error === "string" ? c.error : c.error?.message;
        setAviso({ ok: false, texto: msg ?? "No se pudo enviar el enlace." });
      }
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  if (estado === null) return null;
  const completo = estado.perfilCompletadoEn !== null;

  return (
    <section style={{ ...card, marginTop: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Perfil y Welcome</h2>
        {puedeEnviar && tieneCuenta && !completo && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void reenviar()}
            title="Envía al WhatsApp del apoderado un enlace nuevo para crear el perfil"
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "0.6rem",
              border: "none",
              background: "#25d366",
              color: "white",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            {ocupado ? "Enviando…" : "🔗 Reenviar enlace de perfil"}
          </button>
        )}
      </div>

      {aviso !== null && (
        <p
          role="status"
          style={{
            margin: "0.6rem 0 0",
            fontWeight: 600,
            color: aviso.ok ? "#2e7d32" : "#c62828",
          }}
        >
          {aviso.texto}
        </p>
      )}

      <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.8rem", fontSize: "0.9rem" }}>
        <div>
          <strong>Perfil:</strong>{" "}
          {completo ? (
            <span style={{ color: "#2e7d32" }}>
              creado el {fechaHora(estado.perfilCompletadoEn as string)}
            </span>
          ) : estado.enlace === null ? (
            <span style={{ color: "#b57a00" }}>
              pendiente — todavía no se envió el enlace
              {tieneCuenta ? "" : " (nace al aprobar el contrato)"}
            </span>
          ) : (
            <span style={{ color: "#b57a00" }}>
              pendiente — enlace enviado el {fechaHora(estado.enlace.creadoEn)}
            </span>
          )}
        </div>
        {estado.sobreTi !== null && (
          <div>
            <strong>Sobre sí:</strong> {estado.sobreTi}
          </div>
        )}
        {estado.hobbies !== null && (
          <div>
            <strong>Hobbies:</strong> {estado.hobbies}
          </div>
        )}
        <div>
          <strong>Welcome:</strong>{" "}
          {estado.welcome === null ? (
            <span style={{ color: "var(--texto-suave)" }}>sin agendar</span>
          ) : (
            <span>
              {fechaHora(estado.welcome.startsAt)} (tu hora) · {estado.welcome.duracionMin} min ·
              con {estado.welcome.guia}
              {estado.welcome.asistio !== null && (
                <strong style={{ color: estado.welcome.asistio ? "#2e7d32" : "#c62828" }}>
                  {" "}
                  · {estado.welcome.asistio ? "Asistió" : "No asistió"}
                </strong>
              )}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
