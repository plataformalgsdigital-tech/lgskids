"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Personaje } from "@/ui/Personaje";

/**
 * Página PÚBLICA del enlace de "¿Olvidaste tu clave?" (2026-10-21): llega por
 * WhatsApp al teléfono registrado de la cuenta. Muestra el usuario y deja
 * elegir una clave nueva: 8+ con letras y números si es un niño; 10+ si es del
 * equipo o un guía (la política de la plataforma). Sirve una vez y vence en 24 h.
 */

type Ficha =
  | { estado: "INVALIDO" | "USADO" | "REVOCADO" | "VENCIDO" }
  | { estado: "VIGENTE"; usuario: string; esAlumno: boolean; minimo: number };

const campo: CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  borderRadius: "0.6rem",
  border: "1.5px solid #d8dce6",
  fontSize: "0.98rem",
  fontFamily: "inherit",
  background: "white",
};
const rotulo: CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 700,
  marginBottom: "0.25rem",
  color: "#3b4256",
};
const marco: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "1.5rem 1rem",
  background: "linear-gradient(150deg, #eef4ff 0%, #f1fbef 100%)",
};
const tarjeta: CSSProperties = {
  width: "100%",
  maxWidth: "28rem",
  background: "white",
  borderRadius: "1rem",
  overflow: "hidden",
  boxShadow: "0 18px 50px rgba(23,30,60,0.14)",
};
const boton: CSSProperties = {
  display: "inline-block",
  padding: "0.7rem 1.4rem",
  borderRadius: "0.6rem",
  border: "none",
  background: "var(--lgs-purpura, #6a1b9a)",
  color: "white",
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
};

/** La misma regla del servidor, para avisar antes de enviar. */
function problemaClave(clave: string, minimo: number): string | null {
  if (clave.length < minimo) return `Al menos ${String(minimo)} caracteres.`;
  if (!/[a-zA-Z]/.test(clave)) return "Debe tener al menos una letra.";
  if (!/[0-9]/.test(clave)) return "Debe tener al menos un número.";
  return null;
}

const MENSAJE: Record<"INVALIDO" | "USADO" | "REVOCADO" | "VENCIDO", string> = {
  INVALIDO:
    "Revisa que el enlace esté completo, tal como llegó por WhatsApp. Si el problema sigue, pide uno nuevo en “¿Olvidaste tu clave?”.",
  USADO: "Este enlace ya se usó. Entra a la plataforma con tu usuario y la clave que elegiste.",
  REVOCADO:
    "Este enlace fue reemplazado por uno más nuevo. Usa el último que te llegó por WhatsApp.",
  VENCIDO: "Este enlace venció (dura 24 horas). Pide uno nuevo en “¿Olvidaste tu clave?”.",
};

export default function RestablecerClavePage() {
  const { token } = useParams<{ token: string }>();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [clave, setClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch(`/api/public/restablecer-clave?token=${encodeURIComponent(token)}`);
        setFicha(res.ok ? ((await res.json()) as Ficha) : { estado: "INVALIDO" });
      } catch {
        setFicha({ estado: "INVALIDO" });
      }
    }
    void cargar();
  }, [token]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (ficha?.estado !== "VIGENTE") return;
    const problema = problemaClave(clave, ficha.minimo);
    if (problema !== null) return setError(problema);
    if (clave !== confirmacion) return setError("Las dos claves no coinciden.");
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/public/restablecer-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, clave, confirmacion }),
      });
      const data: { usuario?: string; error?: { message?: string } } = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo guardar la clave.");
        return;
      }
      setListo(data.usuario ?? ficha.usuario);
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (ficha === null) {
    return (
      <main style={marco}>
        <p style={{ color: "#6b7280" }}>Cargando…</p>
      </main>
    );
  }

  if (listo !== null || ficha.estado !== "VIGENTE") {
    return (
      <main style={marco}>
        <div style={{ ...tarjeta, padding: "2rem", textAlign: "center" }}>
          {listo !== null ? (
            <Personaje quien="rocky-celebrando" alto="7rem" />
          ) : (
            <div style={{ fontSize: "2.4rem" }}>🔒</div>
          )}
          <h1 style={{ fontSize: "1.3rem", margin: "0.6rem 0 0.4rem" }}>
            {listo !== null ? "¡Listo, tu clave quedó cambiada!" : "Este enlace no sirve"}
          </h1>
          <p style={{ color: "#4b5563", marginBottom: "1rem" }}>
            {listo !== null ? (
              <>
                Entra con tu usuario <strong>{listo}</strong> y la clave nueva.
              </>
            ) : ficha.estado !== "VIGENTE" ? (
              MENSAJE[ficha.estado]
            ) : null}
          </p>
          <a href="/login" style={boton}>
            Ir a la plataforma
          </a>
        </div>
      </main>
    );
  }

  return (
    <main style={marco}>
      <form onSubmit={(e) => void enviar(e)} style={tarjeta} noValidate>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.9rem",
            padding: "1.2rem 1.4rem",
            background: "linear-gradient(135deg, #e3f2fd, #e8f5e9)",
          }}
        >
          <Personaje quien="rocky-alegre" alto="5rem" />
          <div>
            <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Elige tu clave nueva</h1>
            <p style={{ margin: "0.25rem 0 0", color: "#4b5563", fontSize: "0.9rem" }}>
              Usuario: <strong>{ficha.usuario}</strong>
            </p>
          </div>
        </div>
        <div style={{ padding: "1.2rem 1.4rem 1.5rem", display: "grid", gap: "0.9rem" }}>
          <label>
            <span style={rotulo}>Clave nueva</span>
            <input
              type={ver ? "text" : "password"}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="new-password"
              style={campo}
            />
            <span style={{ fontSize: "0.76rem", color: "#6b7280" }}>
              Al menos {ficha.minimo} caracteres, con letras y números.
            </span>
          </label>
          <label>
            <span style={rotulo}>Repite la clave</span>
            <input
              type={ver ? "text" : "password"}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              autoComplete="new-password"
              style={campo}
            />
          </label>
          <label style={{ display: "flex", gap: "0.4rem", fontSize: "0.85rem", color: "#4b5563" }}>
            <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
            Mostrar la clave
          </label>
          {error !== null && (
            <p role="alert" style={{ margin: 0, color: "#c62828", fontSize: "0.88rem" }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={enviando} style={{ ...boton, width: "100%" }}>
            {enviando ? "Guardando…" : "Guardar clave"}
          </button>
        </div>
      </form>
    </main>
  );
}
