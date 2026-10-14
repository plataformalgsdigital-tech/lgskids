"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { apiFetch } from "@/ui/api-fetch";

/**
 * Las dos acciones de una inasistencia en Servicio › Asistencia:
 *  - escribirle a la familia por WhatsApp (texto propuesto, editable), y
 *  - justificarla con el motivo, que la pasa a JUSTIFICADO.
 * Ninguna manda teléfonos ni ids de sesión: solo el id de la marca. El servidor
 * deriva a quién y qué.
 */

/** El tope de `files`: avisar antes de subir ahorra esperar un rechazo. */
const TAMANO_MAXIMO_SOPORTE = 10 * 1024 * 1024;

export interface LineaInasistencia {
  attendanceId: string;
  nombre: string;
  fecha: string;
  salon: string;
}

const boton: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.6rem",
  border: "1px solid #e3e7f0",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

function Modal({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);
  return (
    <div
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(8,11,24,0.6)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "36rem",
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          padding: "1.1rem 1.25rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

const cabecera = (l: LineaInasistencia) => (
  <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--texto-suave)" }}>
    <strong style={{ color: "inherit" }}>{l.nombre}</strong> · sesión del {l.fecha} · {l.salon}
  </p>
);

const mensajeDeError = async (res: Response, porDefecto: string): Promise<string> => {
  const c: { error?: string | { message?: string } } = await res.json().catch(() => ({}));
  return (typeof c.error === "string" ? c.error : c.error?.message) ?? porDefecto;
};

/** WhatsApp a la familia: a quién va, el texto propuesto (editable) y enviar. */
export function WhatsAppInasistencia({
  linea,
  onCerrar,
  onEnviado,
}: {
  linea: LineaInasistencia;
  onCerrar: () => void;
  onEnviado: (aviso: string) => void;
}) {
  const [destino, setDestino] = useState<{
    apoderado: string | null;
    telefono: string | null;
    telefonoDe: string | null;
  } | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    async function cargar() {
      const res = await apiFetch(`/api/notifications/inasistencia/${linea.attendanceId}`);
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo preparar el mensaje."));
        return;
      }
      const d = (await res.json()) as {
        destinatario: {
          apoderado: string | null;
          telefono: string | null;
          telefonoDe: string | null;
        };
        mensaje: string;
        problema: string | null;
      };
      setDestino(d.destinatario);
      setMensaje(d.mensaje);
      setProblema(d.problema);
    }
    void cargar();
  }, [linea.attendanceId]);

  async function enviar() {
    setOcupado(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/notifications/inasistencia/${linea.attendanceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje }),
      });
      if (!res.ok) {
        setError(
          `${await mensajeDeError(res, "No se pudo enviar.")}${res.status === 502 ? " Quedó en el historial y se reintentará solo." : ""}`,
        );
        return;
      }
      onEnviado(`Mensaje enviado a la familia de ${linea.nombre}.`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal titulo="📲 Escribir a la familia" onCerrar={onCerrar}>
      {cabecera(linea)}
      {destino === null && error === null && (
        <p style={{ color: "var(--texto-suave)" }}>Preparando…</p>
      )}
      {destino !== null && (
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          Para: <strong>{destino.apoderado ?? "sin apoderado registrado"}</strong>
          {destino.telefono !== null && ` · ${destino.telefono}`}
          {destino.telefonoDe === "niño" && " (teléfono del registro del niño)"}
        </p>
      )}
      {problema !== null && (
        <p role="alert" style={{ color: "#b57a00", fontWeight: 600, margin: 0 }}>
          {problema} Corrige el teléfono del apoderado en la ficha del niño.
        </p>
      )}
      {destino !== null && (
        <>
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={8}
            maxLength={1000}
            placeholder="Escribe el mensaje"
            style={{
              width: "100%",
              padding: "0.6rem",
              borderRadius: "0.55rem",
              border: "1.5px solid #d8dce6",
              fontFamily: "inherit",
              fontSize: "0.9rem",
            }}
          />
          <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
            El texto sale de la plantilla “Aviso de inasistencia” (Administración › Mensajes);
            puedes ajustarlo antes de enviar.
          </span>
        </>
      )}
      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
        <button type="button" style={boton} onClick={onCerrar} disabled={ocupado}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={ocupado || problema !== null || mensaje.trim() === "" || destino === null}
          style={{ ...boton, border: "none", background: "#25d366", color: "white" }}
        >
          {ocupado ? "Enviando…" : "Enviar por WhatsApp"}
        </button>
      </div>
    </Modal>
  );
}

/** Justificar: el motivo que dio la familia. La inasistencia pasa a JUSTIFICADA. */
export function JustificarInasistencia({
  linea,
  onCerrar,
  onJustificado,
}: {
  linea: LineaInasistencia;
  onCerrar: () => void;
  onJustificado: (aviso: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [soporte, setSoporte] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    if (soporte !== null && soporte.size > TAMANO_MAXIMO_SOPORTE) {
      setError("El soporte pesa más de 10 MB. Sube una foto o un PDF más liviano.");
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      // Multipart: el motivo y, si lo hay, el soporte que mandó la familia.
      const form = new FormData();
      form.set("justificacion", motivo);
      if (soporte !== null) form.set("soporte", soporte);
      const res = await apiFetch(`/api/attendance/inasistencias/${linea.attendanceId}/justificar`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo justificar."));
        return;
      }
      onJustificado(`La inasistencia de ${linea.nombre} quedó justificada.`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal titulo="✍️ Justificar inasistencia" onCerrar={onCerrar}>
      {cabecera(linea)}
      <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>
          Motivo (lo que contó la familia) *
        </span>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={4}
          maxLength={300}
          placeholder="Ej.: estaba enfermo; la mamá avisó por WhatsApp"
          style={{
            width: "100%",
            padding: "0.6rem",
            borderRadius: "0.55rem",
            border: "1.5px solid #d8dce6",
            fontFamily: "inherit",
            fontSize: "0.9rem",
          }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>
          Soporte (opcional): certificado, nota u otro documento
        </span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setSoporte(e.target.files?.[0] ?? null)}
        />
        <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
          PDF o foto (JPG, PNG, WebP), hasta 10 MB. Queda privado: solo lo ve el equipo.
        </span>
      </label>
      <span style={{ fontSize: "0.75rem", color: "var(--texto-suave)" }}>
        Pasa a “Justificado” y el motivo queda en la asistencia del niño, igual que si lo hubiera
        marcado el guía.
      </span>
      {error !== null && (
        <p role="alert" style={{ color: "#c62828", fontWeight: 600, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
        <button type="button" style={boton} onClick={onCerrar} disabled={ocupado}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={ocupado || motivo.trim() === ""}
          style={{ ...boton, border: "none", background: "var(--lgs-azul)", color: "white" }}
        >
          {ocupado ? "Guardando…" : "Justificar"}
        </button>
      </div>
    </Modal>
  );
}
