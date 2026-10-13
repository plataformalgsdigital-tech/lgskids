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

interface OpcionWelcome {
  id: string;
  startsAt: string;
  duracionMin: number;
  guia: string;
  libres: number;
  enMarcha: boolean;
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
  // Agendar el Welcome desde la ficha (coordinación, `matriculas.gestionar`).
  const [opciones, setOpciones] = useState<OpcionWelcome[]>([]);
  const [puedeAgendar, setPuedeAgendar] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [elegido, setElegido] = useState("");

  const cargar = useCallback(async () => {
    const [res, resW] = await Promise.all([
      apiFetch(`/api/contracts/ninos/${childPersonId}/perfil`),
      apiFetch(`/api/contracts/ninos/${childPersonId}/welcome`),
    ]);
    if (res.ok) setEstado((await res.json()) as EstadoPerfil);
    if (resW.ok) {
      const d = (await resW.json()) as { welcomes: OpcionWelcome[]; puedeAgendar: boolean };
      setOpciones(d.welcomes);
      setPuedeAgendar(d.puedeAgendar);
    }
  }, [childPersonId]);

  async function agendar() {
    if (elegido === "") return;
    setOcupado(true);
    setAviso(null);
    try {
      const res = await apiFetch(`/api/contracts/ninos/${childPersonId}/welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ welcomeId: elegido }),
      });
      if (!res.ok) {
        const c: { error?: { message?: string } } = await res.json().catch(() => ({}));
        setAviso({ ok: false, texto: c.error?.message ?? "No se pudo agendar el Welcome." });
        return;
      }
      setAviso({ ok: true, texto: "Welcome agendado." });
      setEligiendo(false);
      setElegido("");
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => {
    async function inicial() {
      await cargar();
    }
    void inicial();
  }, [cargar]);

  /**
   * `sinWelcome`: para quien entra con el curso ya andando. El enlace no pide
   * agendar Welcome y el mensaje no lo menciona.
   */
  async function reenviar(sinWelcome: boolean) {
    if (
      !window.confirm(
        `Se enviará al WhatsApp del apoderado un enlace NUEVO para crear el perfil${sinWelcome ? ", SIN pedir que agende un Welcome" : ", donde también agenda su Welcome"}. El anterior deja de servir. ¿Enviar?`,
      )
    ) {
      return;
    }
    setOcupado(true);
    setAviso(null);
    try {
      const res = await apiFetch(`/api/contracts/ninos/${childPersonId}/perfil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinWelcome }),
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
          <span style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void reenviar(false)}
              title="Envía al WhatsApp del apoderado un enlace nuevo para crear el perfil y agendar el Welcome"
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
              {ocupado ? "Enviando…" : "🔗 Enviar enlace de perfil"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void reenviar(true)}
              title="Para quien entra con el curso ya andando: el enlace no pide agendar Welcome"
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1.5px solid #25d366",
                background: "white",
                color: "#1b5e20",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              🔗 Enviar enlace sin Welcome
            </button>
          </span>
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
          {puedeAgendar && !eligiendo && (
            <button
              type="button"
              onClick={() => setEligiendo(true)}
              style={{
                marginLeft: "0.6rem",
                padding: "0.25rem 0.7rem",
                borderRadius: "0.5rem",
                border: "1px solid #a5d6a7",
                background: "#e8f5e9",
                color: "#1b5e20",
                fontWeight: 700,
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              📅 {estado.welcome === null ? "Agendar Welcome" : "Cambiar Welcome"}
            </button>
          )}
        </div>

        {eligiendo && (
          <div
            style={{
              border: "1px solid #e3e7f0",
              borderRadius: "0.7rem",
              padding: "0.7rem 0.8rem",
              display: "grid",
              gap: "0.35rem",
            }}
          >
            {opciones.length === 0 ? (
              <span style={{ color: "#b57a00" }}>
                No hay Welcome disponibles para este niño. Si su curso ya empezó, crea uno en el
                calendario marcado «para curso en marcha».
              </span>
            ) : (
              opciones.map((w) => (
                <label
                  key={w.id}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    opacity: w.libres === 0 ? 0.5 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name={`welcome-${childPersonId}`}
                    value={w.id}
                    disabled={w.libres === 0}
                    checked={elegido === w.id}
                    onChange={() => setElegido(w.id)}
                  />
                  <span>
                    {fechaHora(w.startsAt)} · {w.duracionMin} min · con {w.guia} ·{" "}
                    {w.libres === 0 ? "LLENO" : `${String(w.libres)} cupos`}
                    {w.enMarcha && " · curso en marcha"}
                  </span>
                </label>
              ))
            )}
            <span style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
              <button
                type="button"
                disabled={ocupado || elegido === ""}
                onClick={() => void agendar()}
                style={{
                  padding: "0.35rem 0.9rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  background: elegido === "" ? "#c9c6d8" : "var(--lgs-azul)",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {ocupado ? "Agendando…" : "Agendar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEligiendo(false);
                  setElegido("");
                }}
                style={{
                  padding: "0.35rem 0.9rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e3e7f0",
                  background: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
